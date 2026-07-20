if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Registration failed', err));
    });
}

let breadcrumbPath = ["Selection Way"];
let allCoursesData = [];
let currentCategoryFilter = "All";
let currentSearchQuery = "";
let courseNamesCache = {};

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle').innerText = '🌙';
    }
    router();
});

window.addEventListener('hashchange', router);

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerText = isLight ? '🌙' : '☀️';
}

function getProxiedImage(originalUrl) {
    if (!originalUrl || originalUrl.includes("via.placeholder")) return originalUrl;
    return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
}

function getProxiedVideo(originalUrl) {
    if (!originalUrl) return "";
    return `/api/proxy-video?url=${encodeURIComponent(originalUrl)}`;
}

function escapeStr(str) { return String(str || "").replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function formatDuration(val) {
    if (!val || val === "0" || val === 0) return "N/A";
    if (typeof val === 'string' && val.includes(':')) return val;
    let sec = parseInt(val);
    if (isNaN(sec) || sec <= 0) return "N/A";
    let h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function showSkeletons() {
    let html = `<div class="grid">`;
    for(let i=0; i<8; i++) html += `<div class="skeleton"></div>`;
    html += `</div>`;
    document.getElementById("content").innerHTML = html;
}

function updateBreadcrumbUI() {
    let html = ``;
    breadcrumbPath.forEach((item, index) => {
        if(index === breadcrumbPath.length - 1) {
            html += `<span class="breadcrumb-active">${item}</span>`;
        } else {
            html += `<span class="breadcrumb-item">${item}</span> <span class="breadcrumb-arrow">❯</span>`;
        }
    });
    document.getElementById("breadcrumb-container").innerHTML = html;
    
    const backBtn = document.getElementById("back-btn");
    if (breadcrumbPath.length > 1) {
        backBtn.style.display = "block";
    } else {
        backBtn.style.display = "none";
    }
}

function goBack() {
    window.history.back();
}

let currentNavId = 0;

// --- ROUTER ---
function router() {
    closeModal();
    currentNavId++;
    let platform = localStorage.getItem('platform');
    if (!platform) {
        return showPlatformSelection();
    }
    
    document.getElementById('switch-platform-btn').style.display = 'inline-block';
    
    let hash = window.location.hash.slice(1);
    if (!hash || hash === '/' || hash === '') {
        return loadCourses();
    }
    
    let parts = hash.split('/').filter(p => p);
    
    if (parts[0] === 'course' && parts.length >= 2) {
        let courseId = parts[1];
        
        if (parts.length === 2) {
            return loadSubjects(courseId);
        }
        
        if (parts[2] === 'pdfs') {
            if (parts.length === 3) {
                return loadAllPdfs(courseId);
            } else if (parts.length === 4) {
                return loadAllPdfs(courseId, decodeURIComponent(parts[3]));
            }
        }
        
        if (parts[2] === 'mock-tests') {
            return loadMockTests(courseId);
        }
        
        if (parts[2] === 'subject' && parts.length >= 4) {
            let subjectName = decodeURIComponent(parts[3]);
            
            if (parts.length === 4) {
                return loadTopicsForSubject(courseId, subjectName);
            }
            
            if (parts[4] === 'topic' && parts.length >= 6) {
                let topicId = parts[5];
                
                if (parts.length === 6) {
                    let topicName = parts.length > 6 ? decodeURIComponent(parts[6]) : "Topic Details";
                    return loadClassesForTopic(courseId, subjectName, topicId, topicName);
                }
                
                if (parts[6] === 'sub' && parts.length === 8) {
                    let subName = decodeURIComponent(parts[7]);
                    return loadSubtopicClasses(courseId, subjectName, topicId, subName);
                }
            }
        }
    }
    loadCourses();
}

// --- DATA FETCHING & RENDERING ---

function getCourseName(courseId) {
    if (courseNamesCache[courseId]) return courseNamesCache[courseId];
    if (allCoursesData.length > 0) {
        let c = allCoursesData.find(x => x.id == courseId);
        if (c && c.title) return c.title;
    }
    return "Course Details";
}

function loadCourses(){
    breadcrumbPath = ["Selection Way"];
    updateBreadcrumbUI();
    
    if (allCoursesData.length === 0) {
        showSkeletons();
        let navId = currentNavId;
        fetchDataWithCache("/api/courses")
        .then(data=>{
            if (navId !== currentNavId) return;
            allCoursesData = data;
            data.forEach(c => { courseNamesCache[c.id] = c.title; });
            renderCoursesView();
        })
        .catch(() => document.getElementById("content").innerHTML = "<h3 style='padding:20px'>Error loading data.</h3>");
    } else {
        renderCoursesView();
    }
}

function renderCoursesView() {
    let categoriesSet = new Set();
    allCoursesData.forEach(c => {
        let catName = (c.mainCategory && c.mainCategory.mainCategoryName) ? c.mainCategory.mainCategoryName : "Other";
        categoriesSet.add(catName);
    });
    let categoriesList = ["All", ...Array.from(categoriesSet)];

    let uiHtml = `
        <div class="controls-wrapper">
            <input type="text" class="search-input" placeholder="🔍 Search courses by name..." 
                   value="${currentSearchQuery}" oninput="handleSearch(this.value)">
            
            <div class="filter-container">
                ${categoriesList.map(cat => `
                    <button class="filter-btn ${cat === currentCategoryFilter ? 'active' : ''}" 
                            onclick="handleCategoryFilter('${escapeStr(cat)}')">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        </div>
        <div id="dynamic-grid" class="grid"></div>
    `;
    
    document.getElementById("content").innerHTML = uiHtml;
    renderFilteredCards();
}

function handleSearch(query) {
    currentSearchQuery = query.toLowerCase();
    renderFilteredCards();
}

function handleCategoryFilter(category) {
    currentCategoryFilter = category;
    renderCoursesView(); 
}

function renderFilteredCards() {
    let grid = document.getElementById("dynamic-grid");
    
    let filteredData = allCoursesData.filter(c => {
        let titleMatch = (c.title || "").toLowerCase().includes(currentSearchQuery);
        let catName = (c.mainCategory && c.mainCategory.mainCategoryName) ? c.mainCategory.mainCategoryName : "Other";
        let categoryMatch = (currentCategoryFilter === "All") || (catName === currentCategoryFilter);
        return titleMatch && categoryMatch;
    });

    if (filteredData.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">
            <h3>No courses match your search criteria.</h3>
        </div>`;
        return;
    }

    let html = "";
    filteredData.forEach((c, index) => {
        let defaultBanner = "https://placehold.co/570x135?text=No+Banner";
        let rawBanner = c.banner || c.bannerSquare || defaultBanner;
        let bannerImg = getProxiedImage(rawBanner);
        
        let title = c.title || "Unknown Batch";
        let catName = (c.mainCategory && c.mainCategory.mainCategoryName) ? c.mainCategory.mainCategoryName : "Other";
        let createdAt = c.createdAt ? c.createdAt.split("T")[0] : "N/A";
        
        let timingHtml = `<span style="color:var(--text-muted);">Timing not available</span>`;
        if(c.timeTable && c.timeTable.length > 0) {
            timingHtml = `<ul class="timetable-list">`;
            c.timeTable.forEach(tt => { timingHtml += `<li><strong class="tt-label">${tt.topic}:</strong> ${tt.time}</li>`; });
            timingHtml += `</ul>`;
        }

        html += `
        <div class="card nav-card" onclick="window.location.hash = '/course/${c.id}'">
            <div class="banner-wrapper">
                <img src="${bannerImg}" loading="lazy" class="course-banner" alt="Banner" onerror="this.src='${defaultBanner}'">
                <span class="category-badge">${catName}</span>
            </div>
            <div class="card-body">
                <h3 class="course-title">${title}</h3>
                <div class="course-meta"><span>📅</span> <span><b>Start Date:</b> ${createdAt}</span></div>
                <div class="course-meta" style="flex-direction:column;">
                    <div style="display:flex; gap:8px;"><span>⏰</span> <b>Timing:</b></div>
                    <div style="width:100%;">${timingHtml}</div>
                </div>
            </div>
        </div>`;
    });

    grid.innerHTML = html;
}

function loadSubjects(courseId) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName];
    updateBreadcrumbUI();
    showSkeletons();

    let navId = currentNavId;
    fetchDataWithCache(`/api/course/${courseId}`)
    .then(data=>{
        if (navId !== currentNavId) return;
        let subjects={};
        data.forEach(t=>{
            if(!t.sections || t.sections.length === 0) return;
            let sec=t.sections[0];
            if(!subjects[sec.sectionName]){
                subjects[sec.sectionName]={ image:sec.facultyImage, faculty:sec.facultyName, topics:[] };
            }
            subjects[sec.sectionName].topics.push(t);
        });

        let html = `
        <div class="grid">
            <div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/pdfs'" style="border: 2px dashed #4ade80;">
                <div class="card-body" style="align-items:center; text-align:center; justify-content:center;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📁</div>
                    <h3 style="margin:0 0 5px 0; color:#4ade80;">All Course PDFs</h3>
                    <small style="color:var(--text-muted)">View all notes organized by Subject</small>
                </div>
            </div>
            
            <div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/mock-tests'" style="border: 2px dashed #38bdf8;">
                <div class="card-body" style="align-items:center; text-align:center; justify-content:center;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📝</div>
                    <h3 style="margin:0 0 5px 0; color:#38bdf8;">Mock Tests</h3>
                    <small style="color:var(--text-muted)">Attempt tests for this batch</small>
                </div>
            </div>`;

        for(let sub in subjects){
            let s=subjects[sub];
            let defaultImg = 'https://placehold.co/50x50';
            let facultyImg = getProxiedImage(s.image) || defaultImg;
            
            html += `
            <div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/subject/${encodeURIComponent(sub)}'">
                <div class="card-body" style="align-items:center; text-align:center;">
                    <img src="${facultyImg}" loading="lazy" class="subject-img" onerror="this.src='${defaultImg}'">
                    <h3 style="margin:0 0 5px 0; color:var(--text-main);">${sub}</h3>
                    <small style="color:var(--text-muted)">👨‍🏫 ${s.faculty || "Faculty"}</small>
                </div>
            </div>`;
        }
        html += `</div>`;
        document.getElementById("content").innerHTML = html || "<h3 style='padding:20px'>No subjects found.</h3>";
    });
}

function loadAllPdfs(courseId, specificSection = null) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName, "All PDFs"];
    if (specificSection) breadcrumbPath.push(specificSection);
    updateBreadcrumbUI();
    showSkeletons();

    let navId = currentNavId;
    fetchDataWithCache(`/api/pdfs/${courseId}`)
    .then(data => {
        if (navId !== currentNavId) return;
        let groupedPdfs = {};
        data.forEach(topicNode => {
            if(topicNode.pdfs && topicNode.pdfs.length > 0) {
                topicNode.pdfs.forEach(pdf => {
                    let secName = pdf.section?.sectionName || "Other Materials";
                    if(!groupedPdfs[secName]) groupedPdfs[secName] = [];
                    groupedPdfs[secName].push(pdf);
                });
            }
        });

        if (specificSection) {
            let pdfs = groupedPdfs[specificSection] || [];
            let html = `<div class="grid">`;
            pdfs.forEach(pdf => {
                html += `
                <div class="card video-card">
                    <div class="card-content">
                        <h4 style="margin:0 0 12px 0; color:var(--text-main); line-height:1.4;">📄 ${escapeStr(pdf.title)}</h4>
                        <div class="course-meta">👨‍🏫 <b>Teacher:</b> ${escapeStr(pdf.teacherName) || "Unknown"}</div>
                        <div class="course-meta">🏷️ <b>Topic:</b> ${escapeStr(pdf.topic?.topicName) || "General"}</div>
                        <div class="course-meta" style="margin-bottom:15px">📅 <b>Date:</b> ${(pdf.createdAt || "").split("T")[0] || "N/A"}</div>
                    </div>
                    <div class="card-actions">
                        <button onclick="window.open('${pdf.uploadPdf}', '_blank')" class="pdf-btn primary-pdf-btn">Open PDF</button>
                    </div>
                </div>`;
            });
            html += `</div>`;
            document.getElementById("content").innerHTML = html || "<h3 style='padding:20px'>No PDFs found.</h3>";
            return;
        }

        let html = `<div class="grid">`;
        for(let sec in groupedPdfs) {
            html += `
            <div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/pdfs/${encodeURIComponent(sec)}'">
                <div class="card-body">
                    <h3 style="margin:0; color:var(--accent);">📂 ${sec}</h3>
                    <p class="course-meta" style="margin-top:10px">${groupedPdfs[sec].length} PDFs available</p>
                </div>
            </div>`;
        }
        html += `</div>`;
        document.getElementById("content").innerHTML = html || "<h3 style='padding:20px'>No PDFs uploaded yet.</h3>";
    });
}

function loadTopicsForSubject(courseId, subjectName) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName, subjectName];
    updateBreadcrumbUI();
    showSkeletons();
    
    let navId = currentNavId;
    fetchDataWithCache(`/api/course/${courseId}`)
    .then(data=>{
        if (navId !== currentNavId) return;
        let topics = [];
        data.forEach(t=>{
            if(!t.sections || t.sections.length === 0) return;
            let sec=t.sections[0];
            if(sec.sectionName === subjectName) {
                topics.push(t);
            }
        });
        
        let html=`<div class="grid">`;
        topics.forEach(t=>{
            html += `<div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/subject/${encodeURIComponent(subjectName)}/topic/${t.topicId}'">
                        <div class="card-body">
                            <h3 style="margin:0; color:var(--text-main);">📘 ${t.topicName}</h3>
                            <p class="course-meta" style="margin-top:10px">Total Classes: <b>${t.totalClasses || 0}</b></p>
                        </div>
                     </div>`;
        });
        html += `</div>`;
        document.getElementById("content").innerHTML = html || "<h3 style='padding:20px'>No topics found.</h3>";
    });
}

function loadClassesForTopic(courseId, subjectName, topicId, topicName) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName, subjectName, topicName];
    updateBreadcrumbUI();
    showSkeletons();
    
    let navId = currentNavId;
    fetchDataWithCache(`/api/classes/${courseId}/${topicId}`)
    .then(data=>{
        if (navId !== currentNavId) return;
        let subtopics={}; let hasSub=false;
        data.forEach(cls=>{
            let sub=cls.subTopic?.subTopicName;
            if(sub){ hasSub=true; if(!subtopics[sub]) subtopics[sub]=[]; subtopics[sub].push(cls); }
        });
        
        let html="";
        if(hasSub){
            html = `<div class="grid">`;
            for(let sub in subtopics){
                html += `
                <div class="card nav-card" onclick="window.location.hash = '/course/${courseId}/subject/${encodeURIComponent(subjectName)}/topic/${topicId}/sub/${encodeURIComponent(sub)}'">
                    <div class="card-body">
                        <h3 style="margin:0; color:var(--accent);">📂 ${sub}</h3>
                        <p class="course-meta" style="margin-top:10px">${subtopics[sub].length} classes inside</p>
                    </div>
                </div>`;
            }
            html += `</div>`;
        } else { html = renderClasses(data); }
        document.getElementById("content").innerHTML = html || "<h3 style='padding:20px'>No classes found.</h3>";
    });
}

function loadSubtopicClasses(courseId, subjectName, topicId, subName) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName, subjectName, "Topic", subName];
    updateBreadcrumbUI();
    showSkeletons();
    
    let navId = currentNavId;
    fetchDataWithCache(`/api/classes/${courseId}/${topicId}`)
    .then(data=>{
        if (navId !== currentNavId) return;
        let subData = data.filter(cls => cls.subTopic?.subTopicName === subName);
        document.getElementById("content").innerHTML = renderClasses(subData) || "<h3 style='padding:20px'>No classes found.</h3>";
    });
}

function renderClasses(data){
    let html=`<div class="grid">`;
    data.forEach(cls=>{
        html += `
        <div class="card video-card">
            <div class="card-content">
                <h4 style="margin:0 0 12px 0; color:var(--text-main); line-height:1.4;">${escapeStr(cls.title)}</h4>
                <div class="course-meta">👨‍🏫 <b>Teacher:</b> ${escapeStr(cls.teacherName) || "Unknown"}</div>
                <div class="course-meta">📅 <b>Date:</b> ${(cls.classCreatedAt || "").split("T")[0] || "N/A"}</div>
                <div class="course-meta" style="margin-bottom:15px">⏱ <b>Duration:</b> ${formatDuration(cls.duration)}</div>
            </div>
            <div class="card-actions">
                <button onclick='openVideoPlayer(${JSON.stringify(cls.mp4Recordings || []).replace(/'/g, "&apos;")}, "${cls.class_link || ''}", "${escapeStr(cls.title)}")' style="width: 100%;">▶ Play Video</button>`;
        if(cls.classPdf && cls.classPdf.length > 0) {
            cls.classPdf.forEach(pdf=>{
                let pdfName = pdf.name || pdf.title || "Class Notes";
                let shortName = pdfName.length > 30 ? pdfName.substring(0, 30) + "..." : pdfName;
                let pdfUrl = pdf.url || pdf.uploadPdf || "#";
                html += `<button onclick="window.open('${pdfUrl}', '_blank')" class="pdf-btn">📄 ${escapeStr(shortName)}</button>`;
            });
        }
        if(cls.classTest && cls.classTest.length > 0) {
            let platform = localStorage.getItem('platform') || 'selectionway';
            cls.classTest.forEach(test => {
                let testName = test.name || test.title || test.series_name || "Quiz";
                let shortName = testName.length > 30 ? testName.substring(0, 30) + "..." : testName;
                let testId = test.id || test._id;
                html += `<button onclick="window.open('/test/${testId}?platform=${platform}', '_blank')" class="pdf-btn" style="background:#8b5cf6; border-color:#8b5cf6;">📝 ${escapeStr(shortName)}</button>`;
            });
        }
        html += `</div></div>`;
    });
    html += `</div>`;
    return html;
}

// --- MOCK TEST LOGIC ---
function loadMockTests(courseId) {
    let courseName = getCourseName(courseId);
    breadcrumbPath = ["Selection Way", courseName, "Mock Tests"];
    updateBreadcrumbUI();
    showSkeletons();

    let navId = currentNavId;
    fetchDataWithCache(`/api/mock-tests/${courseId}`)
    .then(data => {
        if (navId !== currentNavId) return;
        if(data.state !== 200 || !data.data || !data.data.topic) {
            document.getElementById("content").innerHTML = "<h3 style='padding:20px'>No mock tests available for this batch.</h3>";
            return;
        }

        let html = `<div class="grid">`;
        
        data.data.topic.forEach(topic => {
            let seriesHtml = '';
            topic.series.forEach(test => {
                seriesHtml += `
                    <button onclick="window.open('/test/${test.series_id}', '_blank')" 
                            class="btn-sm" 
                            style="margin-top:8px; width:100%; display:block; text-align:left; background: var(--bg-main); border: 1px solid var(--border-color);">
                        📝 ${escapeStr(test.series_name)}
                    </button>`;
            });

            html += `
            <div class="card nav-card" style="cursor:default;">
                <div class="card-body">
                    <h3 style="margin:0; color:var(--accent); border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                        📊 ${escapeStr(topic.topic_name)}
                    </h3>
                    <div style="margin-top:10px; max-height:250px; overflow-y:auto; padding-right:5px;">
                        ${seriesHtml}
                    </div>
                </div>
            </div>`;
        });
        
        html += `</div>`;
        document.getElementById("content").innerHTML = html;
    })
    .catch(() => document.getElementById("content").innerHTML = "<h3 style='padding:20px'>Error loading mock tests.</h3>");
}

// --- VIDEO PLAYER LOGIC ---
let currentVideoElement = null;
let currentActiveVideoUrl = "";

function openVideoPlayer(recordings, defaultLink, title) {
    let videoUrl = defaultLink || (recordings.length > 0 ? recordings[0].url : "");
    
    if (videoUrl) {
        videoUrl = videoUrl.trim();
        if (!videoUrl.startsWith('http')) {
            videoUrl = 'https://' + videoUrl.replace(/^\/\//, '');
        }
    }
    
    const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");

    if (isYouTube) {
        let videoId = "";
        if (videoUrl.includes("v=")) {
            videoId = videoUrl.split("v=")[1].split("&")[0];
        } else if (videoUrl.includes("youtu.be/")) {
            videoId = videoUrl.split("youtu.be/")[1].split("?")[0];
        }

        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

        let html = `
            <div class="video-modal-box" onclick="event.stopPropagation()">
                <div class="video-header">
                    <h3>${title || 'YouTube Video'}</h3>
                    <button style="background:transparent; color:var(--text-muted); padding:0; font-size:1.8rem; cursor:pointer;" onclick="closeModal()">&times;</button>
                </div>
                <div class="video-wrapper">
                    <iframe width="100%" height="100%" src="${embedUrl}" 
                        frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen></iframe>
                </div>
                <div style="padding: 10px; text-align: center;">
                    <button class="btn-sm" onclick="window.open('${videoUrl}', '_blank')">External Link ↗</button>
                </div>
            </div>
        `;
        const modal = document.getElementById("modal");
        modal.innerHTML = html;
        modal.style.display = "flex";
        return; 
    }

    let safeRecordings = recordings.filter(r => r.url && r.url.includes('.mp4'));
    let video720 = safeRecordings.find(r => r.quality && r.quality.includes('720'));
    currentActiveVideoUrl = video720 ? video720.url : (defaultLink || (safeRecordings.length > 0 ? safeRecordings[0].url : ""));

    if (currentActiveVideoUrl) {
        currentActiveVideoUrl = currentActiveVideoUrl.trim();
        if (!currentActiveVideoUrl.startsWith('http')) {
            currentActiveVideoUrl = 'https://' + currentActiveVideoUrl.replace(/^\/\//, '');
        }
    }

    if (!currentActiveVideoUrl) {
        alert("This video format is not supported for internal playback. Opening link...");
        window.open(videoUrl, "_blank");
        return;
    }

    let isM3u8 = currentActiveVideoUrl.includes('.m3u8');
    let proxiedInitialUrl = getProxiedVideo(currentActiveVideoUrl);

    let qualityButtons = '';
    if (defaultLink) {
        qualityButtons += `<button class="btn-sm ${currentActiveVideoUrl === defaultLink.trim() ? 'active' : ''}" onclick="changeVideoQuality('${defaultLink}', this)">Default</button>`;
    }
    
    safeRecordings.forEach(r => {
        qualityButtons += `<button class="btn-sm ${currentActiveVideoUrl === r.url.trim() ? 'active' : ''}" onclick="changeVideoQuality('${r.url}', this)">${r.quality}</button>`;
    });
    
    let html = `
        <div class="video-modal-box" onclick="event.stopPropagation()">
            <div class="video-header">
                <h3>${title || 'Class Recording'}</h3>
                <button style="background:transparent; color:var(--text-muted); padding:0; font-size:1.8rem; cursor:pointer;" onclick="closeModal()">×</button>
            </div>
            <div class="video-wrapper">
                <video id="custom-video-player" controls playsinline style="width: 100%; height: 100%;"></video>
            </div>
            <div class="video-controls-custom">
                <div class="video-controls-group">
                    <span>Speed:</span>
                    ${[1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map(s => 
                        `<button class="btn-sm ${s === 1 ? 'active' : ''}" onclick="changePlaybackSpeed(${s}, this)">${s}x</button>`
                    ).join('')}
                    
                    <button id="open-link-btn" class="btn-sm" onclick="window.open('${currentActiveVideoUrl}', '_blank')" style="margin-left: 8px; background: #22c55e; color: white; border-color: #22c55e;">↗ Open Link</button>
                </div>
                ${qualityButtons ? `<div class="video-controls-group"><span>Quality:</span>${qualityButtons}</div>` : ''}
            </div>
        </div>
    `;

    const modal = document.getElementById("modal");
    modal.innerHTML = html;
    modal.style.display = "flex";
    currentVideoElement = document.getElementById("custom-video-player");

    if (isM3u8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
            xhrSetup: function(xhr) {
                xhr.withCredentials = false;
            }
        });
        hls.loadSource(proxiedInitialUrl);
        hls.attachMedia(currentVideoElement);
        currentVideoElement.hls = hls;
        
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            currentVideoElement.play().catch(e => console.log("Autoplay prevented by browser", e));
        });
        
    } else if (isM3u8 && currentVideoElement.canPlayType('application/vnd.apple.mpegurl')) {
        currentVideoElement.src = proxiedInitialUrl;
        currentVideoElement.play().catch(e => console.log(e));
    } else {
        currentVideoElement.src = proxiedInitialUrl;
        currentVideoElement.play().catch(e => console.log(e));
    }
}

function changePlaybackSpeed(speed, btn) {
    if(currentVideoElement) {
        currentVideoElement.playbackRate = speed;
    }
    let siblings = btn.parentElement.querySelectorAll('.btn-sm');
    siblings.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function changeVideoQuality(newUrl, btn) {
    if(!currentVideoElement) return;

    if (newUrl) {
        newUrl = newUrl.trim();
        if (!newUrl.startsWith('http')) {
            newUrl = 'https://' + newUrl.replace(/^\/\//, '');
        }
    }
    currentActiveVideoUrl = newUrl;
    
    let isM3u8 = currentActiveVideoUrl.includes('.m3u8');
    let proxiedUrl = getProxiedVideo(currentActiveVideoUrl);

    let currentTime = currentVideoElement.currentTime;
    let isPaused = currentVideoElement.paused;
    let currentSpeed = currentVideoElement.playbackRate;

    if (currentVideoElement.hls) {
        currentVideoElement.hls.destroy();
        delete currentVideoElement.hls;
    }

    if (isM3u8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
            xhrSetup: function(xhr) {
                xhr.withCredentials = false;
            }
        });
        hls.loadSource(proxiedUrl);
        hls.attachMedia(currentVideoElement);
        currentVideoElement.hls = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            currentVideoElement.currentTime = currentTime;
            currentVideoElement.playbackRate = currentSpeed;
            if(!isPaused) currentVideoElement.play().catch(e => console.log(e));
        });
    } else {
        currentVideoElement.src = proxiedUrl;
        currentVideoElement.addEventListener('loadedmetadata', function restoreState() {
            currentVideoElement.currentTime = currentTime;
            currentVideoElement.playbackRate = currentSpeed;
            if(!isPaused) currentVideoElement.play().catch(e => console.log(e));
            currentVideoElement.removeEventListener('loadedmetadata', restoreState); 
        }, { once: true });
    }

    let siblings = btn.parentElement.querySelectorAll('.btn-sm');
    siblings.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const openLinkBtn = document.getElementById('open-link-btn');
    if(openLinkBtn) {
        openLinkBtn.setAttribute('onclick', `window.open('${currentActiveVideoUrl}', '_blank')`);
    }
}
function closeModal() { 
    if(currentVideoElement) {
        currentVideoElement.pause();
        if (currentVideoElement.hls) {
            currentVideoElement.hls.destroy();
            delete currentVideoElement.hls;
        }
        currentVideoElement.removeAttribute('src'); 
        currentVideoElement.load();
        currentVideoElement = null;
    }
    const modal = document.getElementById("modal");
    modal.style.display = "none"; 
    modal.innerHTML = `<div class="modal-box" id="modalContent"></div>`; 
}

window.onclick = function(e) { 
    if (e.target == document.getElementById("modal")) {
        closeModal();
    } 
}

document.addEventListener('keydown', function(e) {
    if (!currentVideoElement) return; 
    
    const modal = document.getElementById("modal");
    if (modal.style.display !== "flex") return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        currentVideoElement.currentTime -= 10;
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        currentVideoElement.currentTime += 10;
    } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (currentVideoElement.paused) {
            currentVideoElement.play();
        } else {
            currentVideoElement.pause();
        }
    }
});


function showPlatformSelection() {
    document.getElementById('switch-platform-btn').style.display = 'none';
    breadcrumbPath = ["Select Platform"];
    updateBreadcrumbUI();
    let html = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center; padding: 20px;">
            <h2 style="margin-bottom: 10px; color: var(--text-main); font-size: 2.5rem; font-weight: 700;">Welcome Back</h2>
            <p style="color: var(--text-muted); margin-bottom: 40px; font-size: 1.1rem;">Choose your learning platform to continue</p>
            <div style="display:flex; gap: 30px; flex-wrap: wrap; justify-content: center; width: 100%; max-width: 800px;">
                
                <div onclick="setPlatform('selectionway')" class="card nav-card" style="flex: 1; min-width: 280px; padding: 40px 20px; text-align: center; background: linear-gradient(145deg, var(--bg-card), var(--bg-main)); border: 2px solid rgba(56, 189, 248, 0.3); border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div style="width: 80px; height: 80px; background: rgba(56, 189, 248, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #38bdf8;">
                        🎯
                    </div>
                    <h3 style="margin: 0; font-size: 1.5rem; color: var(--text-main);">Selection Way</h3>
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.95rem;">Access standard courses & tests</p>
                </div>

                <div onclick="setPlatform('topperswisdom')" class="card nav-card" style="flex: 1; min-width: 280px; padding: 40px 20px; text-align: center; background: linear-gradient(145deg, var(--bg-card), var(--bg-main)); border: 2px solid rgba(168, 85, 247, 0.3); border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div style="width: 80px; height: 80px; background: rgba(168, 85, 247, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #a855f7;">
                        👑
                    </div>
                    <h3 style="margin: 0; font-size: 1.5rem; color: var(--text-main);">Toppers Wisdom</h3>
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.95rem;">Premium curated study material</p>
                </div>

            </div>
        </div>
    `;
    document.getElementById("content").innerHTML = html;
}

function setPlatform(platform) {
    localStorage.setItem('platform', platform);
    allCoursesData = []; apiCache = {}; // Clear cache when switching
    courseNamesCache = {};
    window.location.hash = '/';
    router();
}

function switchPlatform() {
    localStorage.removeItem('platform');
    window.location.hash = '/';
    router();
}


let apiCache = {};

function fetchDataWithCache(url) {
    let platform = localStorage.getItem('platform') || 'selectionway';
    let cacheKey = platform + "_" + url;
    
    if (apiCache[cacheKey]) {
        return Promise.resolve(apiCache[cacheKey]);
    }
    
    let options = { headers: { 'X-Platform': platform } };
    return fetch(url, options)
        .then(res => res.json())
        .then(data => {
            apiCache[cacheKey] = data;
            return data;
        });
}

// Custom Fetch Wrapper
function fetchWithPlatform(url, options = {}) {
    let platform = localStorage.getItem('platform') || 'selectionway';
    options.headers = {
        ...options.headers,
        'X-Platform': platform
    };
    return fetch(url, options);
}
