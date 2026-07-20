if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Registration failed', err));
    });
}

let historyStack = [];
let breadcrumbPath = ["Selection Way"];
let currentCourse = "";

let allCoursesData = [];
let currentCategoryFilter = "All";
let currentSearchQuery = "";

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle').innerText = '🌙';
    }
});

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

function loadCourses(isBack = false){
    if(!isBack) { historyStack = []; breadcrumbPath = ["Selection Way"]; }
    updateBreadcrumbUI();
    
    if (allCoursesData.length === 0) {
        showSkeletons();
        fetch("/api/courses")
        .then(res=>res.json())
        .then(data=>{
            allCoursesData = data;
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

        let animDelay = (index * 0.05) + "s";

        html += `
        <div class="card nav-card" style="animation-delay: ${animDelay};" onclick="loadSubjects('${c.id}', '${escapeStr(title)}')">
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

function loadSubjects(courseId, courseName, isBack = false){
    if(!isBack) {
        historyStack.push(() => loadCourses(true));
        breadcrumbPath.push(courseName);
    }
    updateBreadcrumbUI();
    currentCourse = courseId;
    showSkeletons();

    fetch(`/api/course/${courseId}`)
    .then(res=>res.json())
    .then(data=>{
        let subjects={};
        data.forEach(t=>{
            if(!t.sections || t.sections.length === 0) return;
            let sec=t.sections[0];
            if(!subjects[sec.sectionName]){
                subjects[sec.sectionName]={ image:sec.facultyImage, faculty:sec.facultyName, topics:[] };
            }
            subjects[sec.sectionName].topics.push(t);
        });

        // ==========================================
        // MOCK TEST CARD ADDED RIGHT AFTER PDF FOLDER
        // ==========================================
        let html = `
        <div class="grid">
            <div class="card nav-card" onclick="loadAllPdfs('${courseId}')" style="border: 2px dashed #4ade80;">
                <div class="card-body" style="align-items:center; text-align:center; justify-content:center;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📁</div>
                    <h3 style="margin:0 0 5px 0; color:#4ade80;">All Course PDFs</h3>
                    <small style="color:var(--text-muted)">View all notes organized by Subject</small>
                </div>
            </div>
            
            <div class="card nav-card" onclick="loadMockTests('${courseId}')" style="border: 2px dashed #38bdf8;">
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
            <div class="card nav-card" onclick='loadTopics(${JSON.stringify(s.topics).replace(/'/g, "&apos;")}, "${escapeStr(sub)}")'>
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

function loadAllPdfs(courseId, isBack = false) {
    if(!isBack) {
        let prevCourseName = breadcrumbPath[1]; 
        historyStack.push(() => loadSubjects(currentCourse, prevCourseName, true));
        breadcrumbPath.push("All PDFs");
    }
    updateBreadcrumbUI();
    showSkeletons();

    fetch(`/api/pdfs/${courseId}`)
    .then(res => res.json())
    .then(data => {
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

        let html = `<div class="grid">`;
        for(let sec in groupedPdfs) {
            let encodedData = encodeURIComponent(JSON.stringify(groupedPdfs[sec]));
            html += `
            <div class="card nav-card" onclick="showGroupedPdfs('${encodedData}', '${escapeStr(sec)}')">
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

function showGroupedPdfs(encodedPdfs, secName) {
    let pdfs = JSON.parse(decodeURIComponent(encodedPdfs));
    let savedHtml = document.getElementById("content").innerHTML;
    historyStack.push(() => {
        updateBreadcrumbUI();
        document.getElementById("content").innerHTML = savedHtml;
    });
    breadcrumbPath.push(secName);
    updateBreadcrumbUI();
    
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
    document.getElementById("content").innerHTML = html;
}

function loadTopics(topics, subjectName, isBack = false){
    if(!isBack) {
        let prevCourseName = breadcrumbPath[1];
        historyStack.push(() => loadSubjects(currentCourse, prevCourseName, true));
        breadcrumbPath.push(subjectName);
    }
    updateBreadcrumbUI();
    let html=`<div class="grid">`;
    topics.forEach(t=>{
        html += `<div class="card nav-card" onclick="loadClasses('${t.topicId}','${escapeStr(t.topicName)}')">
                    <div class="card-body">
                        <h3 style="margin:0; color:var(--text-main);">📘 ${t.topicName}</h3>
                        <p class="course-meta" style="margin-top:10px">Total Classes: <b>${t.totalClasses || 0}</b></p>
                    </div>
                 </div>`;
    });
    html += `</div>`;
    document.getElementById("content").innerHTML = html;
}

function loadClasses(topicId, topicName, isBack = false){
    if(!isBack) {
        let savedTopicsHtml = document.getElementById("content").innerHTML;
        historyStack.push(() => {
            updateBreadcrumbUI();
            document.getElementById("content").innerHTML = savedTopicsHtml; 
        });
        breadcrumbPath.push(topicName);
    }
    updateBreadcrumbUI();
    showSkeletons();
    fetch(`/api/classes/${currentCourse}/${topicId}`)
    .then(res=>res.json())
    .then(data=>{
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
                <div class="card nav-card" onclick='showSubtopic(${JSON.stringify(subtopics[sub]).replace(/'/g, "&apos;")}, "${escapeStr(sub)}")'>
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

function showSubtopic(classes, name){
    let savedClassesHtml = document.getElementById("content").innerHTML;
    historyStack.push(() => {
        updateBreadcrumbUI();
        document.getElementById("content").innerHTML = savedClassesHtml;
    });
    breadcrumbPath.push(name);
    updateBreadcrumbUI();
    document.getElementById("content").innerHTML = renderClasses(classes);
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
                let shortName = pdf.name ? (pdf.name.length > 30 ? pdf.name.substring(0, 30) + "..." : pdf.name) : "Class Notes";
                html += `<button onclick="window.open('${pdf.url}', '_blank')" class="pdf-btn">📄 ${escapeStr(shortName)}</button>`;
            });
        }
        html += `</div></div>`;
    });
    html += `</div>`;
    return html;
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
                xhr.withCredentials = false; // Prevents CORS preflight failures
            }
        });
        hls.loadSource(proxiedInitialUrl);
        hls.attachMedia(currentVideoElement);
        currentVideoElement.hls = hls;
        
        // Auto-play when ready
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
        // Destroy HLS instance when modal is closed to free memory and stop background downloading
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

function goBack(){
    if(historyStack.length > 0) {
        let prevAction = historyStack.pop();
        breadcrumbPath.pop(); 
        prevAction();         
    } else {
        loadCourses();
    }
}
// --- MOCK TEST LOGIC ---
function loadMockTests(courseId, isBack = false) {
    if(!isBack) {
        let prevCourseName = breadcrumbPath[1]; 
        historyStack.push(() => loadSubjects(currentCourse, prevCourseName, true));
        breadcrumbPath.push("Mock Tests");
    }
    updateBreadcrumbUI();
    showSkeletons();

    fetch(`/api/mock-tests/${courseId}`)
    .then(res => res.json())
    .then(data => {
        if(data.state !== 200 || !data.data || !data.data.topic) {
            document.getElementById("content").innerHTML = "<h3 style='padding:20px'>No mock tests available for this batch.</h3>";
            return;
        }

        let html = `<div class="grid">`;
        
        // Loop through the topics (Percentage, Ratios and Proportion, etc.)
        data.data.topic.forEach(topic => {
            let seriesHtml = '';
            
            // Generate a button for each test in the series
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

loadCourses();