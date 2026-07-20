from pymongo import MongoClient
import certifi
from werkzeug.security import generate_password_hash
import os

MONGO_URI = os.environ.get("MONGO_URI", "mongodb+srv://lakshayiphone:083rsbCNYiXpno97@sonipat.vvbdgaa.mongodb.net/?retryWrites=true&w=majority&appName=Sonipat")
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client['Sonipat']

# Your Master Credentials
admin_user = "admin_kunal"
admin_pass = "admin1234" 

# Create or Update the admin account
db['users'].update_one(
    {"username": admin_user},
    {"$set": {
        "password": generate_password_hash(admin_pass),
        "role": "admin",
        "devices": []
    }},
    upsert=True
)

print(f"Master admin '{admin_user}' configured successfully. You can now log into the web dashboard.")
