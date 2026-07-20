import os
import requests
import hashlib
import logging
import random
import certifi
import cloudscraper
import re
from urllib.parse import urljoin, quote
from flask import Flask, jsonify, render_template, send_from_directory, request, redirect, Response, session, url_for
from flask_cors import CORS
from pymongo import MongoClient
from concurrent.futures import ThreadPoolExecutor
from cachetools import cached, TTLCache
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app)

app.secret_key = os.environ.get("SECRET_KEY", "selection_way_super_secret_key_123!")

USER_ID = "3334432"
API_HOSTS = {
    "selectionway": "https://gdgoenkaratia.com/api",
    "topperswisdom": "https://node.topperswisdom.com/api"
}
UPLOAD_FOLDER = '/tmp' 

MONGO_URI = os.environ.get("MONGO_URI", "mongodb+srv://lakshayiphone:083rsbCNYiXpno97@sonipat.vvbdgaa.mongodb.net/?retryWrites=true&w=majority&appName=Sonipat")

client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client['Sonipat']
courses_collection = db['courses']
users_collection = db['users'] 
results_collection = db['mock_results']

api_cache = TTLCache(maxsize=50, ttl=600)
details_cache = TTLCache(maxsize=500, ttl=600)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
]

global_scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})

# --- AUTHENTICATION WRAPPERS ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            if request.path.startswith('/api/'):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session or session.get('role') != 'admin':
            if request.path.startswith('/api/'):
                return jsonify({"error": "Admin access required"}), 403
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

# --- LOGIN & ADMIN ROUTES ---
@app.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "GET":
        return render_template("login.html")
    
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    device_id = data.get("device_id")

    if not username or not password or not device_id:
        return jsonify({"error": "Missing credentials or device ID"}), 400

    user = users_collection.find_one({"username": username})
    
    if not user or not check_password_hash(user['password'], password):
        return jsonify({"error": "Invalid username or password"}), 401

    role = user.get("role", "student")
    
    if role == "admin":
        session['username'] = username
        session['role'] = role
        return jsonify({"success": True, "redirect": "/admin"})

    bound_devices = user.get("devices", [])
    if device_id in bound_devices:
        session['username'] = username
        session['role'] = role
        return jsonify({"success": True, "redirect": "/"})
    
    max_devices = user.get("max_devices", 2)
    if len(bound_devices) < max_devices:
        users_collection.update_one({"_id": user["_id"]}, {"$push": {"devices": device_id}})
        session['username'] = username
        session['role'] = role
        return jsonify({"success": True, "redirect": "/"})
    
    return jsonify({"error": f"Maximum device limit ({max_devices}) reached. Please contact admin."}), 403

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login_page'))

@app.route("/admin")
@admin_required
def admin_dashboard():
    return render_template("admin.html")

@app.route("/admin/api/users", methods=["GET"])
@admin_required
def get_users():
    users = list(users_collection.find({"role": {"$ne": "admin"}}, {"password": 0}))
    for u in users:
        u["_id"] = str(u["_id"])
        u["device_count"] = len(u.get("devices", []))
        u["max_devices"] = u.get("max_devices", 2)
    return jsonify(users)

@app.route("/admin/api/add_user", methods=["POST"])
@admin_required
def add_user():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    max_devices = int(data.get("max_devices", 2))
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if users_collection.find_one({"username": username}):
        return jsonify({"error": "Username already exists"}), 400
        
    users_collection.insert_one({
        "username": username,
        "password": generate_password_hash(password),
        "role": "student",
        "devices": [],
        "max_devices": max_devices
    })
    return jsonify({"success": True})

@app.route("/admin/api/update_devices/<user_id>", methods=["POST"])
@admin_required
def update_devices(user_id):
    data = request.json
    max_devices = int(data.get("max_devices", 2))
    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"max_devices": max_devices}})
    return jsonify({"success": True})

@app.route("/admin/api/delete_user/<user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    users_collection.delete_one({"_id": ObjectId(user_id)})
    return jsonify({"success": True})

@app.route("/admin/api/reset_devices/<user_id>", methods=["POST"])
@admin_required
def reset_devices(user_id):
    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"devices": []}})
    return jsonify({"success": True})

@app.route("/api/submit-score", methods=["POST"])
@login_required
def submit_score():
    try:
        data = request.json
        results_collection.insert_one({
            "test_id": data.get("test_id"),
            "username": session.get('username'),
            "student_name": data.get("student_name"),
            "score": data.get("score"),
            "correct": data.get("correct"),
            "incorrect": data.get("incorrect"),
            "time_taken_seconds": data.get("time_taken"),
            "responses": data.get("responses"), # <--- NOW SAVING SPECIFIC ANSWERS
            "submitted_at": datetime.utcnow()
        })
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Score submission failed: {e}")
        return jsonify({"error": "Failed to save score"}), 500

# --- MAIN APP ROUTES ---
@app.route("/manifest.json")
def manifest():
    return jsonify({"name": "Selection Way", "short_name": "SelectionWay", "start_url": "/", "display": "standalone", "background_color": "#0b1120", "theme_color": "#0b1120"})

@app.route("/")
@login_required
def home():
    return render_template("index.html")

@cached(details_cache)
def get_course_details(course_id, platform="selectionway"):
    try:
        api_host = API_HOSTS.get(platform, API_HOSTS["selectionway"])
        url = f"{api_host}/courses/{course_id}?userId={USER_ID}"
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        return response.json().get("data", {})
    except Exception as e:
        logging.error(f"Error fetching course details {course_id} for {platform}: {e}")
        return {}

@cached(api_cache)
def fetch_and_merge_courses(platform="selectionway"):
    try:
        api_host = API_HOSTS.get(platform, API_HOSTS["selectionway"])
        api_url = f"{api_host}/courses/active?userId={USER_ID}"
        api_data = requests.get(api_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10).json().get("data", [])
        api_ids = [str(c.get("id")) for c in api_data if c.get("id")]
    except Exception as e:
        logging.error(f"Error fetching active courses from API for {platform}: {e}")
        api_ids = []
            
    db_data = list(courses_collection.find({}, {"id": 1, "_id": 0}))
    db_ids = [str(c.get("id")) for c in db_data if c.get("id")]

    unique_ids = list(dict.fromkeys(api_ids + db_ids))
    detailed_courses = []
    
    with ThreadPoolExecutor(max_workers=20) as executor:
        from functools import partial
        fetch_func = partial(get_course_details, platform=platform)
        results = executor.map(fetch_func, unique_ids)
        for res in results:
            if res and res.get("id"): detailed_courses.append(res)
    return detailed_courses

@app.route("/api/courses")
@login_required
def courses():
    platform = request.headers.get("X-Platform", "selectionway")
    try: return jsonify(fetch_and_merge_courses(platform))
    except Exception as e:
        logging.error(f"Error in /api/courses: {e}")
        return jsonify({"error": "Unable to load data"}), 502

@app.route("/api/proxy-image")
@login_required
def proxy_image():
    image_url = request.args.get('url')
    if not image_url:
        return jsonify({"error": "No URL provided"}), 400
    try:
        # Use the global cloudscraper instance to bypass cloudflare challenges
        response = global_scraper.get(image_url, timeout=10)
        flask_response = Response(response.content, mimetype=response.headers.get('Content-Type', 'image/jpeg'))
        flask_response.headers["Cache-Control"] = "public, max-age=86400"
        return flask_response
    except Exception as e:
        logging.error(f"Failed to proxy image {image_url}: {e}")
        return jsonify({"error": "Failed to load image"}), 502

@app.route("/api/proxy-video")
@login_required
def proxy_video():
    video_url = request.args.get('url')
    if not video_url:
        return jsonify({"error": "No URL provided"}), 400
    try:
        # Using streaming requests to handle larger video files efficiently
        response = requests.get(video_url, stream=True, timeout=15)
        headers = {key: value for key, value in response.headers.items() if key.lower() not in ['content-encoding', 'transfer-encoding']}
        
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                yield chunk
                
        return Response(generate(), headers=headers, status=response.status_code)
    except Exception as e:
        logging.error(f"Failed to proxy video {video_url}: {e}")
        return jsonify({"error": "Failed to stream video"}), 502

@app.route("/api/course/<course_id>")
@login_required
def topics(course_id):
    platform = request.headers.get("X-Platform", "selectionway")
    api_host = API_HOSTS.get(platform, API_HOSTS["selectionway"])
    try:
        url = f"{api_host}/topic-and-section?courseId={course_id}&userId={USER_ID}"
        return jsonify(requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10).json().get("data", {}).get("topics", []))
    except Exception as e:
        logging.error(f"Error fetching topics for course {course_id} on {platform}: {e}")
        return jsonify({"error": "Failed to fetch topics"}), 502

@app.route("/api/classes/<course_id>/<topic_id>")
@login_required
def classes(course_id, topic_id):
    platform = request.headers.get("X-Platform", "selectionway")
    api_host = API_HOSTS.get(platform, API_HOSTS["selectionway"])
    try:
        url = f"{api_host}/topics/{topic_id}/classes?courseId={course_id}&userId={USER_ID}"
        return jsonify(requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10).json().get("data", {}).get("classes", []))
    except Exception as e:
        logging.error(f"Error fetching classes for topic {topic_id} on {platform}: {e}")
        return jsonify({"error": "Failed to fetch classes"}), 502
    
@app.route("/api/pdfs/<course_id>")
@login_required
def course_pdfs(course_id):
    platform = request.headers.get("X-Platform", "selectionway")
    api_host = API_HOSTS.get(platform, API_HOSTS["selectionway"])
    try:
        url = f"{api_host}/courses/{course_id}/pdfs?groupBy=topic&userId={USER_ID}"
        return jsonify(requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10).json().get("data", {}).get("topics", []))
    except Exception as e:
        logging.error(f"Error fetching PDFs for course {course_id} on {platform}: {e}")
        return jsonify({"error": "Failed to fetch PDFs"}), 502

@app.route("/api/mock-tests/<course_id>")
@login_required
def mock_tests_list(course_id):
    try:
        url = f"https://selectionway.hranker.com/admin/api/getMongoCourseDataByTopic-v2/{course_id}/{USER_ID}"
        return jsonify(requests.get(url, headers={"User-Agent": random.choice(USER_AGENTS)}, timeout=10).json())
    except Exception as e:
        logging.error(f"Error fetching mock tests for course {course_id}: {e}")
        return jsonify({"error": "Failed to fetch mock tests"}), 502

@app.route("/test/<test_id>")
@login_required
def serve_test(test_id):
    url = f"https://selectionway.hranker.com/admin/api/questions-solutions-new/{test_id}/en"
    headers = {"User-Agent": random.choice(USER_AGENTS), "Accept": "application/json"}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()

        cleaned_output = {"state": data.get("state"), "msg": data.get("msg"), "data": []}

        for section in data.get("data", []):
            section_data = {
                "section_name": section.get("section_name"),
                "series_time": section.get("series_time"),
                "series_name": section.get("series_name"),
                "questions": []
            }
            all_questions = section.get("all_questions", {})
            for _, questions in all_questions.items():
                for q in questions:
                    question_data = {
                        "question_en": q.get("question_en"),
                        "question_hi": q.get("question_hi"),
                        "marks": q.get("marks"),
                        "option_en": [q.get(f"option_en_{i}") for i in range(1, 6)],
                        "option_hi": [q.get(f"option_hi_{i}") for i in range(1, 6)],
                        "solution_en": q.get("solution_en"),
                        "solution_hi": q.get("solution_hi"),
                        "answer_en": q.get("answer_en") 
                    }
                    section_data["questions"].append(question_data)
            cleaned_output["data"].append(section_data)

        # --- FETCH PREVIOUS ATTEMPT FROM MONGODB ---
        prev_attempt = results_collection.find_one(
            {"test_id": test_id, "username": session.get('username')},
            sort=[("submitted_at", -1)] # Get the most recent attempt
        )
        
        # Serialize MongoDB fields for JSON transfer
        if prev_attempt:
            prev_attempt['_id'] = str(prev_attempt['_id'])
            if 'submitted_at' in prev_attempt:
                prev_attempt['submitted_at'] = prev_attempt['submitted_at'].isoformat()

        return render_template("template.html", test_data=cleaned_output, test_id=test_id, prev_attempt=prev_attempt)
        
    except Exception as e:
        return f"<h3>Failed to load test data. Please try again later. Error: {e}</h3>", 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 2992))
    app.run(host="0.0.0.0", port=port)
