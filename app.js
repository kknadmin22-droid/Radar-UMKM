/**
 * Radar UMKM Campurejo — Application Logic
 * Powered by Leaflet.js, PapaParse, and Vanilla JS
 */

// Configuration
// Jika ingin menggunakan Google Sheets, publikasikan sheet Anda sebagai CSV 
// (File -> Bagikan -> Publikasikan ke web -> Pilih opsi CSV) dan masukkan tautannya di bawah ini.
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTMM5fdKJE77Mq-ZcsfHCRo0QRRNDmP_SGb2pG8vpppWyq_xjDlqi4nMVEsPLJE8Gi_5kxpkgFpYdXY/pub?gid=1194202036&single=true&output=csv"; 
const LOCAL_FALLBACK_CSV = "data/dummy_umkm.csv";
const CAMPUREJO_CENTER = [-7.1488, 111.9018];
const DEFAULT_ZOOM = 15;
const FLY_TO_ZOOM = 17;

// Global State
let map = null;
let umkmData = [];
let markersLayer = null;
let boundaryLayer = null;
let activeCategory = "all";
let searchQuery = "";
let isOpenNowOnly = false;
let isFavoritesOnly = false;
let favoritesList = JSON.parse(localStorage.getItem("radar_umkm_favorites") || "[]");
const markerInstances = {}; // Menyimpan instansi marker berdasarkan id_unik untuk pencarian / deep-linking
const cardInstances = {}; // Menyimpan DOM card untuk menghindari rebuild berulang
let isFirstRender = true;

// Category configurations for styling and icons
const categoryMeta = {
    'Kuliner': { icon: 'fa-utensils', color: '#ea580c', badgeClass: 'badge-kuliner' },
    'Jasa': { icon: 'fa-screwdriver-wrench', color: '#2563eb', badgeClass: 'badge-jasa' },
    'Kerajinan': { icon: 'fa-scissors', color: '#d97706', badgeClass: 'badge-kerajinan' },
    'Pertanian': { icon: 'fa-wheat-awn', color: '#65a30d', badgeClass: 'badge-pertanian' },
    'Belanja': { icon: 'fa-store', color: '#db2777', badgeClass: 'badge-belanja' }
};

// Document Ready
document.addEventListener("DOMContentLoaded", () => {
    console.log("%c[Radar UMKM Debug] Loaded Version 20260726_v2 (Optimized Canvas Map + Header Text Left)", "color: #10b981; font-weight: bold; font-size: 14px;");
    initMap();
    initUIEventListeners();
    loadBoundaryGeoJSON();
    fetchUMKMData();
});

/**
 * 1. MAP INITIALIZATION
 */
function initMap() {
    // Inisialisasi peta Leaflet.js
    map = L.map("map", {
        zoomControl: false, // Matikan zoom default untuk diposisikan ulang
        attributionControl: true,
        preferCanvas: true, // Gunakan canvas rendering untuk performa lebih mulus
        zoomSnap: 0.5,      // Zoom lebih halus berjarak 0.5 step (pro level)
        wheelDebounceTime: 40,
        wheelPxPerZoomLevel: 120,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        inertia: true,
        inertiaDeceleration: 3000
    }).setView(CAMPUREJO_CENTER, DEFAULT_ZOOM);

    // Gunakan Tile Layer CartoDB Positron (OSM-based, modern, clean, gratis)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        keepBuffer: 4,
        tileSize: 256
    }).addTo(map);

    // Posisikan kontrol zoom di kanan bawah (tidak mengganggu panel mengambang)
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Layer Group untuk menyimpan marker UMKM secara dinamis
    markersLayer = L.layerGroup().addTo(map);
}

/**
 * 2. LOAD BOUNDARY GEOJSON
 */
function loadBoundaryGeoJSON() {
    fetch("geojson/campurejo_boundary.json")
        .then(response => {
            if (!response.ok) throw new Error("Batas wilayah tidak ditemukan");
            return response.json();
        })
        .then(geoJsonData => {
            // Gambar polygon wilayah Desa Campurejo
            boundaryLayer = L.geoJSON(geoJsonData, {
                style: {
                    color: "hsl(162, 70%, 22%)", // Warna batas (primary)
                    weight: 2.5,
                    dashArray: "5, 8", // Garis putus-putus premium
                    opacity: 0.8,
                    fillColor: "hsl(162, 70%, 45%)", // Warna isi (primary-light)
                    fillOpacity: 0.05
                }
            }).addTo(map);
            
            // Pasang popup penjelasan batas wilayah jika polygon diklik
            boundaryLayer.bindPopup(`
                <div style="font-family: 'Inter', sans-serif; padding: 4px;">
                    <strong style="color: hsl(162, 70%, 22%);">Batas Desa Campurejo</strong>
                    <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">
                        Wilayah administratif Desa Campurejo, Kec. Bojonegoro.
                    </p>
                </div>
            `);
        })
        .catch(error => {
            console.warn("Gagal memuat batas wilayah GeoJSON:", error);
            // Tetap jalankan web tanpa batas wilayah jika file bermasalah
        });
}

/**
 * 3. DATA FETCHING & PARSING
 */
function fetchUMKMData() {
    const urlParams = new URLSearchParams(window.location.search);
    let urlToFetch = GOOGLE_SHEET_CSV_URL ? GOOGLE_SHEET_CSV_URL : LOCAL_FALLBACK_CSV;
    
    if (urlParams.has('test')) {
        const testType = urlParams.get('test');
        if (testType === 'large') {
            urlToFetch = "data/dummy_umkm_large.csv";
        } else {
            urlToFetch = LOCAL_FALLBACK_CSV;
        }
    }
    
    fetch(urlToFetch)
        .then(response => {
            if (!response.ok) throw new Error(`Status HTTP: ${response.status}`);
            return response.text();
        })
        .then(csvString => {
            parseCSVData(csvString);
        })
        .catch(error => {
            console.error("Gagal mengambil data UMKM:", error);
            showErrorOverlay(error.message);
        });
}

function parseCSVData(csvString) {
    Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
            if (results.data && results.data.length > 0) {
                // Reset cache render
                isFirstRender = true;
                for (const key in markerInstances) delete markerInstances[key];
                for (const key in cardInstances) delete cardInstances[key];
                
                // Bersihkan dan normalisasi data dari CSV
                umkmData = results.data.map(item => {
                    const latVal = cleanCoordinate(item.latitude);
                    const lngVal = cleanCoordinate(item.longitude);
                    const hasCoords = !isNaN(latVal) && !isNaN(lngVal);

                    return {
                        id: item.id_unik ? item.id_unik.trim() : generateSlug(item.nama_usaha),
                        name: item.nama_usaha ? item.nama_usaha.trim() : "UMKM Tanpa Nama",
                        category: item.kategori ? item.kategori.trim() : "Lainnya",
                        description: item.deskripsi ? item.deskripsi.trim() : "Tidak ada deskripsi.",
                        lat: latVal,
                        lng: lngVal,
                        hasValidCoords: hasCoords,
                        whatsapp: item.kontak_wa ? sanitizeWhatsAppNumber(item.kontak_wa) : "",
                        photoUrls: item.link_foto ? convertGoogleDriveLinks(item.link_foto.trim()) : [],
                        photoUrl: item.link_foto ? convertGoogleDriveLinks(item.link_foto.trim())[0] || "" : "",
                        linkGmaps: item.link_gmaps ? item.link_gmaps.trim() : "",
                        produkUnggulan: item.produk_unggulan ? item.produk_unggulan.trim() : "",
                        jamOperasional: item.jam_operasional ? item.jam_operasional.trim() : "",
                        hariOperasional: item.hari_operasional ? item.hari_operasional.trim() : "",
                        jamOperasionalKhusus: item.jam_operasional_khusus ? item.jam_operasional_khusus.trim() : "",
                        ceritaUmkm: item.cerita_umkm ? item.cerita_umkm.trim() : "",
                        linkSosmed: item.link_sosmed ? item.link_sosmed.trim() : "",
                        rawWhatsApp: item.kontak_wa || "" // untuk pencarian
                    };
                });
                
                // Urutkan alfabetis berdasarkan nama
                umkmData.sort((a, b) => a.name.localeCompare(b.name));

                // Sembunyikan loaders awal
                hideInitialLoader();
                
                // Render marker di peta & daftar di sidebar
                renderAppContent();
                
                // Cek deep link jika ada
                handleDeepLinking();
            } else {
                showErrorOverlay("Data Google Sheet kosong atau format tidak sesuai.");
            }
        },
        error: (error) => {
            showErrorOverlay(`Gagal mem-parsing file CSV: ${error.message}`);
        }
    });
}

/**
 * 4. RENDERING LOGIC (MARKERS & LIST)
 */
function renderAppContent() {
    const listContainer = document.getElementById("umkm-list");
    
    // 1. Buat marker dan card sekali saja di awal
    if (isFirstRender) {
        window.umkmData = umkmData;
        updateInfoKKNStats();
        listContainer.innerHTML = "";
        markersLayer.clearLayers();
        umkmData.forEach(item => {
            if (item.hasValidCoords) {
                const marker = createCustomMarker(item);
                markerInstances[item.id] = marker;
            }
            const card = createUMKMCard(item);
            cardInstances[item.id] = card;
            listContainer.appendChild(card);
        });
        isFirstRender = false;
    }
    
    let visibleCount = 0;
    
    // 2. Filter & Tampilkan/Sembunyikan marker dan card yang sudah ada
    umkmData.forEach(item => {
        const matchesCategory = (activeCategory === "all" || item.category.toLowerCase() === activeCategory.toLowerCase());
        
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch = searchQuery === "" || 
            item.name.toLowerCase().includes(searchLower) ||
            item.category.toLowerCase().includes(searchLower) ||
            item.description.toLowerCase().includes(searchLower) ||
            (item.produkUnggulan && item.produkUnggulan.toLowerCase().includes(searchLower));

        const matchesOpenNow = !isOpenNowOnly || (isCurrentlyOpen(item.jamOperasional, item.hariOperasional, item.jamOperasionalKhusus) === true);
        const matchesFavorite = !isFavoritesOnly || favoritesList.includes(item.id);
            
        const isVisible = matchesCategory && matchesSearch && matchesOpenNow && matchesFavorite;
        
        // Toggle Card
        const card = cardInstances[item.id];
        if (card) {
            card.style.display = isVisible ? "flex" : "none";
        }
        
        // Toggle Marker
        const marker = markerInstances[item.id];
        if (marker) {
            if (isVisible) {
                if (!markersLayer.hasLayer(marker)) {
                    markersLayer.addLayer(marker);
                }
            } else {
                if (markersLayer.hasLayer(marker)) {
                    markersLayer.removeLayer(marker);
                }
            }
        }
        
        if (isVisible) {
            visibleCount++;
        }
    });

    // Perbarui jumlah UMKM yang ditemukan
    document.getElementById("umkm-count").textContent = visibleCount;

    if (visibleCount === 0) {
        document.getElementById("empty-state").style.display = "block";
        listContainer.style.display = "none";
    } else {
        document.getElementById("empty-state").style.display = "none";
        listContainer.style.display = "flex";
    }
}

// Helper untuk membuat HTML Marker Pin Leaflet
function createCustomMarker(item) {
    const meta = categoryMeta[item.category] || { icon: 'fa-store', color: '#115e59', badgeClass: 'badge-default' };
    
    const customIcon = L.divIcon({
        html: `
            <div class="custom-marker-pin" style="background-color: ${meta.color};">
                <i class="fa-solid ${meta.icon}"></i>
            </div>
            <div class="custom-marker-shadow"></div>
        `,
        className: 'custom-leaflet-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });

    const marker = L.marker([item.lat, item.lng], { icon: customIcon });

    // Hubungkan Popup yang Estetik
    const popupContent = createPopupHTML(item, meta);
    marker.bindPopup(popupContent, {
        maxWidth: 290,
        className: 'custom-popup-box'
    });

    // Interaksi saat marker diklik
    marker.on('click', () => {
        // Sorot kartu di daftar jika terlihat
        highlightCardInList(item.id);
        highlightActiveMarkerElement(item.id);
    });

    return marker;
}

// Helper membuat HTML Popup Card
// Helper membuat HTML Popup Card
function createPopupHTML(item, meta) {
    let photoHTML = '';
    if (item.photoUrls && item.photoUrls.length > 0) {
        if (item.photoUrls.length === 1) {
            photoHTML = `<img src="${item.photoUrls[0]}" alt="${item.name}" class="popup-img" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
        } else {
            const images = item.photoUrls.map((url, idx) => 
                `<img src="${url}" alt="${item.name} - ${idx+1}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
            ).join('');
            photoHTML = `
                <div class="popup-gallery-container">
                    <button class="nav-gallery-btn popup-nav-btn prev-btn" onclick="event.stopPropagation(); const g = this.parentElement.querySelector('.popup-gallery'); if(g) g.scrollBy({left: -g.clientWidth, behavior: 'smooth'});" aria-label="Gambar Sebelumnya">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <div class="popup-gallery" onscroll="if(!this._ticking){this._ticking=true; requestAnimationFrame(()=>{const b=this.parentElement.querySelector('.badge-idx'); if(b && this.clientWidth>0) b.textContent=Math.round(this.scrollLeft/this.clientWidth)+1; this._ticking=false;});}">
                        ${images}
                    </div>
                    <div class="popup-gallery-badge">
                        <i class="fa-regular fa-images"></i> <span class="badge-idx">1</span>/${item.photoUrls.length}
                    </div>
                    <button class="nav-gallery-btn popup-nav-btn next-btn" onclick="event.stopPropagation(); const g = this.parentElement.querySelector('.popup-gallery'); if(g) g.scrollBy({left: g.clientWidth, behavior: 'smooth'});" aria-label="Gambar Berikutnya">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }
    }

    let waButtonHTML = '';
    if (item.whatsapp) {
        const textMessage = encodeURIComponent(`Halo ${item.name}, saya melihat usaha Anda di peta Radar UMKM Campurejo. Apakah bisa bertanya-tanya?`);
        waButtonHTML = `
            <a href="https://wa.me/${item.whatsapp}?text=${textMessage}" target="_blank" class="popup-wa-btn">
                <i class="fa-brands fa-whatsapp"></i> Hubungi via WhatsApp
            </a>
        `;
    }

    const gmapsLink = item.linkGmaps ? item.linkGmaps : `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
    const gmapsButtonHTML = `
        <a href="${gmapsLink}" target="_blank" class="popup-gmaps-btn">
            <i class="fa-solid fa-map-location-dot"></i> Rute Google Maps
        </a>
    `;

    let storyButtonHTML = '';
    if (item.ceritaUmkm) {
        storyButtonHTML = `
            <button class="popup-story-btn" onclick="openStoryModal('${item.id}')">
                <i class="fa-solid fa-book-open"></i> Baca Kisah UMKM
            </button>
        `;
    }

    // Badge Status Buka/Tutup di Popup
    let statusHTML = '';
    const openState = isCurrentlyOpen(item.jamOperasional, item.hariOperasional, item.jamOperasionalKhusus);
    if (openState !== null) {
        statusHTML = openState ? 
            `<span class="status-badge status-open status-toggle-btn" onclick="event.stopPropagation(); toggleSchedule('${item.id}', this, 'popup')" title="Klik untuk lihat jadwal seminggu"><i class="fa-solid fa-circle"></i> Buka <i class="fa-solid fa-chevron-down toggle-chevron" style="margin-left: 2px; font-size: 0.6rem;"></i></span>` :
            `<span class="status-badge status-closed status-toggle-btn" onclick="event.stopPropagation(); toggleSchedule('${item.id}', this, 'popup')" title="Klik untuk lihat jadwal seminggu"><i class="fa-regular fa-circle"></i> Tutup <i class="fa-solid fa-chevron-down toggle-chevron" style="margin-left: 2px; font-size: 0.6rem;"></i></span>`;
    }

    const scheduleHTML = createWeeklyScheduleHTML(item, 'popup');

    // Tombol sosial media di popup
    const popupSosmedLinks = parseSocialLinks(item.linkSosmed);
    const popupSosmedHTML = popupSosmedLinks.length > 0 
        ? `<div class="popup-sosmed">` +
            popupSosmedLinks.map(s =>
                `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="sosmed-btn" style="--sosmed-color: ${s.color}" title="${s.label}">
                    <i class="${s.icon}"></i>
                </a>`
            ).join('') +
          `</div>`
        : '';

    const isFav = favoritesList.includes(item.id);
    const favBtnHTML = `
        <button class="fav-card-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${item.id}', this)" title="${isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit'}" aria-label="Favorit">
            <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>
    `;

    return `
        <div class="popup-container">
            ${photoHTML}
            <div class="popup-body">
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;">
                    <span class="badge ${meta.badgeClass}">${item.category}</span>
                    ${statusHTML}
                </div>
                ${scheduleHTML}
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <h3 class="popup-title" style="margin: 0;">${item.name}</h3>
                    ${favBtnHTML}
                </div>
                <p class="popup-desc">${item.description}</p>
                ${popupSosmedHTML}
                <div class="popup-actions">
                    ${waButtonHTML}
                    ${gmapsButtonHTML}
                    ${storyButtonHTML}
                </div>
            </div>
        </div>
    `;
}

// Helper membuat DOM Card untuk list
function createUMKMCard(item) {
    const meta = categoryMeta[item.category] || { icon: 'fa-store', color: '#115e59', badgeClass: 'badge-default' };
    
    const card = document.createElement("div");
    card.className = "umkm-card";
    if (!item.hasValidCoords) {
        card.classList.add("coords-invalid");
    }
    card.id = `card-${item.id}`;
    card.setAttribute("role", "button");
    
    let contactHTML = "";
    if (item.whatsapp) {
        contactHTML = `<span class="umkm-card-contact"><i class="fa-brands fa-whatsapp"></i> WhatsApp Aktif</span>`;
    }

    // A. Badge Status Buka/Tutup ATAU Warning Koordinat
    let statusHTML = '';
    if (!item.hasValidCoords) {
        statusHTML = `<span class="status-badge status-closed" style="background-color: hsl(35, 90%, 93%); color: hsl(35, 90%, 35%);"><i class="fa-solid fa-triangle-exclamation"></i> Lokasi Belum Diatur</span>`;
    } else {
        const openState = isCurrentlyOpen(item.jamOperasional, item.hariOperasional, item.jamOperasionalKhusus);
        if (openState !== null) {
            statusHTML = openState ? 
                `<span class="status-badge status-open status-toggle-btn" onclick="event.stopPropagation(); toggleSchedule('${item.id}', this, 'card')" title="Klik untuk lihat jadwal seminggu"><i class="fa-solid fa-circle"></i> Buka <i class="fa-solid fa-chevron-down toggle-chevron" style="margin-left: 2px; font-size: 0.6rem;"></i></span>` :
                `<span class="status-badge status-closed status-toggle-btn" onclick="event.stopPropagation(); toggleSchedule('${item.id}', this, 'card')" title="Klik untuk lihat jadwal seminggu"><i class="fa-regular fa-circle"></i> Tutup <i class="fa-solid fa-chevron-down toggle-chevron" style="margin-left: 2px; font-size: 0.6rem;"></i></span>`;
        }
    }

    const scheduleHTML = item.hasValidCoords ? createWeeklyScheduleHTML(item, 'card') : '';

    // B. Tags Produk Unggulan
    let tagsHTML = '';
    if (item.produkUnggulan) {
        const tags = item.produkUnggulan.split(',').slice(0, 3); // Ambil maks 3 tag
        tagsHTML = `<div class="product-tags">` + 
            tags.map(t => `<span class="product-tag">${t.trim()}</span>`).join('') + 
            `</div>`;
    }

    // C. Tombol Baca Kisah
    let storyBtnHTML = '';
    if (item.ceritaUmkm) {
        storyBtnHTML = `
            <button class="umkm-card-story-btn" onclick="event.stopPropagation(); openStoryModal('${item.id}')">
                <i class="fa-solid fa-book-open"></i> Kisah
            </button>
        `;
    }

    // D. Tombol Share Link & Favorit
    const isFav = favoritesList.includes(item.id);
    const favBtnHTML = `
        <button class="fav-card-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${item.id}', this)" title="${isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit'}" aria-label="Favorit">
            <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>
    `;

    const shareBtnHTML = `
        <button class="share-card-btn" onclick="event.stopPropagation(); shareLink('${item.id}')" aria-label="Bagikan lokasi" title="Bagikan lokasi">
            <i class="fa-regular fa-share-from-square"></i>
        </button>
    `;

    // E. Tombol Sosial Media
    let sosmedHTML = '';
    const sosmedLinks = parseSocialLinks(item.linkSosmed);
    if (sosmedLinks.length > 0) {
        sosmedHTML = `<div class="umkm-card-sosmed">` +
            sosmedLinks.map(s => 
                `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="sosmed-btn" style="--sosmed-color: ${s.color}" onclick="event.stopPropagation()" title="${s.label}">
                    <i class="${s.icon}"></i>
                </a>`
            ).join('') +
            `</div>`;
    }

    // F. Indikator Peta
    const mapIndicatorHTML = item.hasValidCoords ? 
        `<span style="color: var(--neutral-medium); font-size: 0.7rem;"><i class="fa-solid fa-location-dot"></i> Lihat Peta</span>` :
        `<span style="color: var(--neutral-medium); font-size: 0.7rem; opacity: 0.6;"><i class="fa-solid fa-location-pin-slash"></i> Peta Tidak Tersedia</span>`;

    card.innerHTML = `
        <div class="umkm-card-header">
            <div>
                <h3 class="umkm-card-name">${item.name}</h3>
                <div style="display: flex; gap: 8px; margin-top: 4px; align-items: center; flex-wrap: wrap;">
                    <span class="badge ${meta.badgeClass}">${item.category}</span>
                    ${statusHTML}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                ${favBtnHTML}
                ${shareBtnHTML}
            </div>
        </div>
        ${scheduleHTML}
        <p class="umkm-card-desc">${item.description}</p>
        ${tagsHTML}
        ${sosmedHTML}
        <div class="umkm-card-footer" style="margin-top: 8px;">
            ${contactHTML}
            <div style="display: flex; gap: 8px; align-items: center;">
                ${storyBtnHTML}
                ${mapIndicatorHTML}
            </div>
        </div>
    `;

    // Klik kartu untuk fokus peta
    card.addEventListener("click", () => {
        if (!item.hasValidCoords) {
            showToast(`Koordinat untuk ${item.name} eror/belum diset di Sheets!`);
            return;
        }
        focusOnUMKM(item);
        
        // Pada tampilan mobile: kecilkan/tutup bottom-sheet agar peta terlihat
        if (window.innerWidth <= 768) {
            const listPanel = document.getElementById("list-panel");
            listPanel.classList.add("collapsed");
            
            const btn = document.getElementById("toggle-list-btn");
            btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
        }
    });

    return card;
}

/**
 * 5. FOCUS & HIGHLIGHT CONTROLLERS
 */
function focusOnUMKM(item) {
    const marker = markerInstances[item.id];
    if (marker) {
        // Sorot kartu & pin aktif
        highlightCardInList(item.id);
        
        // Geser kamera ke koordinat secara halus
        map.flyTo([item.lat, item.lng], FLY_TO_ZOOM, {
            animate: true,
            duration: 1.2
        });

        // Tunggu transisi kamera selesai sebelum membuka popup
        map.once('moveend', () => {
            marker.openPopup();
            highlightActiveMarkerElement(item.id);
        });
    }
}

function highlightCardInList(id) {
    // Hilangkan highlight sebelumnya
    document.querySelectorAll(".umkm-card").forEach(card => {
        card.classList.remove("active-card");
    });

    // Tambahkan ke kartu yang terpilih
    const activeCard = document.getElementById(`card-${id}`);
    if (activeCard) {
        activeCard.classList.add("active-card");
        
        // Gulir kontainer list agar kartu aktif selalu masuk pandangan
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function highlightActiveMarkerElement(id) {
    // Bersihkan kelas aktif di marker Leaflet DOM
    document.querySelectorAll(".custom-leaflet-marker").forEach(el => {
        el.classList.remove("active-marker");
    });
    
    const activeMarker = markerInstances[id];
    if (activeMarker && activeMarker._icon) {
        activeMarker._icon.classList.add("active-marker");
    }
}

/**
 * 6. SEARCH & FILTER INTERACTION
 */
function initUIEventListeners() {
    const searchInput = document.getElementById("search-input");
    const clearSearchBtn = document.getElementById("clear-search");
    
    // Input Pencarian
    let searchDebounceTimer;
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        if (searchQuery.trim().length > 0) {
            clearSearchBtn.style.display = "flex";
        } else {
            clearSearchBtn.style.display = "none";
        }
        
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            renderAppContent();
        }, 150);
    });

    // Tombol Bersihkan Pencarian
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchQuery = "";
        clearSearchBtn.style.display = "none";
        searchInput.focus();
        renderAppContent();
    });

    // Filter Buka Sekarang
    const btnFilterOpen = document.getElementById("btn-filter-open");
    if (btnFilterOpen) {
        btnFilterOpen.addEventListener("click", (e) => {
            e.stopPropagation();
            isOpenNowOnly = !isOpenNowOnly;
            btnFilterOpen.classList.toggle("active", isOpenNowOnly);
            btnFilterOpen.setAttribute("aria-selected", isOpenNowOnly ? "true" : "false");
            renderAppContent();
        });
    }

    // Filter Favorit
    const btnFilterFav = document.getElementById("btn-filter-fav");
    if (btnFilterFav) {
        btnFilterFav.addEventListener("click", (e) => {
            e.stopPropagation();
            isFavoritesOnly = !isFavoritesOnly;
            btnFilterFav.classList.toggle("active", isFavoritesOnly);
            btnFilterFav.setAttribute("aria-selected", isFavoritesOnly ? "true" : "false");
            renderAppContent();
        });
    }

    // Klik Tabs Kategori
    const categoryButtons = document.querySelectorAll(".category-tab[data-category]");
    categoryButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            categoryButtons.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            
            activeCategory = btn.getAttribute("data-category");
            renderAppContent();
        });
    });


    // Panel Bottom Sheet & Desktop List Toggle
    const toggleListBtn = document.getElementById("toggle-list-btn");
    const listPanel = document.getElementById("list-panel");
    const listHeader = document.querySelector(".list-header");

    const setCollapsed = (collapsed) => {
        if (collapsed) {
            listPanel.classList.add("collapsed");
            if (toggleListBtn) toggleListBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
        } else {
            listPanel.classList.remove("collapsed");
            if (toggleListBtn) toggleListBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        }
    };

    const toggleListPanel = () => {
        const isCollapsed = listPanel.classList.contains("collapsed");
        setCollapsed(!isCollapsed);
    };

    if (toggleListBtn) {
        toggleListBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleListPanel();
        });
    }
    
    if (listHeader) {
        listHeader.addEventListener("click", () => toggleListPanel());
    }

    // ── Touch swipe gesture untuk bottom sheet ────────────────────────────────
    let touchStartY = 0;
    let touchStartTime = 0;

    listHeader.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    listHeader.addEventListener("touchend", (e) => {
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;
        const velocity = Math.abs(deltaY) / deltaTime; // px/ms

        // Swipe up (deltaY negatif) → buka, Swipe down (deltaY positif) → tutup
        // Threshold: gerak > 30px ATAU cepat (velocity > 0.3)
        if (Math.abs(deltaY) > 30 || velocity > 0.3) {
            if (deltaY < 0) {
                setCollapsed(false); // Swipe UP → expand
            } else {
                setCollapsed(true);  // Swipe DOWN → collapse
            }
        }
    }, { passive: true });

    // ── Mouse drag-to-scroll untuk gallery popup di desktop ──────────────────
    // Gunakan event delegation agar menangkap gallery yang dibuat secara dinamis
    document.addEventListener("mousedown", (e) => {
        const gallery = e.target.closest(".popup-gallery");
        if (!gallery) return;

        e.preventDefault();
        gallery.style.cursor = "grabbing";
        gallery.style.userSelect = "none";

        const startX = e.pageX;
        const startScrollLeft = gallery.scrollLeft;

        const onMouseMove = (e) => {
            const dx = e.pageX - startX;
            gallery.scrollLeft = startScrollLeft - dx;
        };

        const onMouseUp = () => {
            gallery.style.cursor = "grab";
            gallery.style.userSelect = "";
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    // Error Overlay Fallback button
    document.getElementById("retry-fetch-btn").addEventListener("click", () => {
        document.getElementById("error-overlay").style.display = "none";
        showInitialLoader();
        fetchUMKMData();
    });

    document.getElementById("load-fallback-btn").addEventListener("click", () => {
        document.getElementById("error-overlay").style.display = "none";
        showInitialLoader();
        console.warn("Menggunakan data CSV cadangan lokal.");
        fetch(LOCAL_FALLBACK_CSV)
            .then(res => res.text())
            .then(csv => parseCSVData(csv))
            .catch(err => {
                hideInitialLoader();
                alert("Data cadangan gagal dimuat. Pastikan file 'data/dummy_umkm.csv' tersedia.");
            });
    });
}

/**
 * 7. DEEP LINKING CONTROLLER (?umkm=id_unik)
 */
function handleDeepLinking() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetUmkmId = urlParams.get("umkm");
    
    if (targetUmkmId) {
        // Cari data dengan id_unik
        const cleanId = targetUmkmId.trim();
        const found = umkmData.find(item => item.id === cleanId);
        
        if (found) {
            // Berikan jeda sebentar agar loading selesai
            setTimeout(() => {
                focusOnUMKM(found);
            }, 800);
        }
    }
}

/**
 * 8. UTILITIES & LOGGING
 */
function sanitizeWhatsAppNumber(num) {
    // Hapus spasi, strip, plus, tanda kurung
    let clean = num.toString().replace(/[^0-9]/g, '');
    
    // Ubah 08... menjadi 628...
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    
    // Jika format internasional tapi depannya 62, biarkan
    return clean;
}

function generateSlug(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Ganti spasi dengan -
        .replace(/[^\w\-]+/g, '')       // Hapus karakter non-word
        .replace(/\-\-+/g, '-')         // Ganti ganda -- dengan -
        .replace(/^-+/, '')             // Hapus - di awal
        .replace(/-+$/, '');            // Hapus - di akhir
}

// Loader UI controls
function hideInitialLoader() {
    const loader = document.getElementById("initial-loader");
    if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => {
            loader.style.display = "none";
        }, 500);
    }
    // Set skeleton loading off
    document.getElementById("list-skeleton").style.display = "none";
}

function showInitialLoader() {
    const loader = document.getElementById("initial-loader");
    if (loader) {
        loader.style.display = "flex";
        loader.style.opacity = "1";
    }
    document.getElementById("list-skeleton").style.display = "block";
    document.getElementById("umkm-list").style.display = "none";
    document.getElementById("empty-state").style.display = "none";
}

function showErrorOverlay(detailsMsg) {
    hideInitialLoader();
    const errorOverlay = document.getElementById("error-overlay");
    const errorDetails = document.getElementById("error-details");
    
    errorOverlay.style.display = "flex";
    errorDetails.textContent = `Penyebab: ${detailsMsg || 'Koneksi gagal atau CORS terblokir.'}`;
}

/**
 * 9. ADDITIONAL FEATURES (STORY MODAL, OPERATIONS, SHARING)
 */

// Menghitung status buka/tutup berdasarkan hari operasional dan jam operasional
function isCurrentlyOpen(jamOperasional, hariOperasional, jamOperasionalKhusus) {
    const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const now = new Date();
    const todayIndex = now.getDay();
    const todayName = daysOfWeek[todayIndex];

    let targetJam = jamOperasional;

    // 1. Cek Hari Operasional (jika kolom ada dan terisi)
    if (hariOperasional && hariOperasional.trim() !== "") {
        const hariBukaList = hariOperasional.toLowerCase().split(",").map(d => d.trim());
        const isBukaHariIni = hariBukaList.includes(todayName.toLowerCase());

        if (!isBukaHariIni) {
            return false; // Tutup hari ini
        }
    }

    // 2. Cek Jam Operasional Khusus (jika kolom ada dan terisi)
    if (jamOperasionalKhusus && jamOperasionalKhusus.trim() !== "") {
        // Format contoh: "Sabtu: 08:00 - 12:00, Minggu: Tutup"
        const rules = jamOperasionalKhusus.split(",");
        for (let rule of rules) {
            const parts = rule.split(":");
            if (parts.length >= 2) {
                const dayKey = parts[0].trim().toLowerCase();
                if (dayKey === todayName.toLowerCase()) {
                    const timeValue = parts.slice(1).join(":").trim();
                    if (timeValue.toLowerCase() === "tutup") {
                        return false;
                    }
                    targetJam = timeValue;
                    break;
                }
            }
        }
    }

    // 3. Jalankan logika pengecekan jam operasional
    if (!targetJam || targetJam.trim() === "") return null;
    try {
        // Normalisasi tanda titik menjadi titik dua (misal "08.00" -> "08:00")
        const normalizedJam = targetJam.replace(/\./g, ':');
        const parts = normalizedJam.split("-");
        if (parts.length !== 2) return null;
        
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        const parseTimeToMinutes = (timeStr) => {
            const cleanTimeStr = timeStr.replace(/\./g, ':');
            const timeParts = cleanTimeStr.trim().split(":");
            return parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        };
        
        const openMinutes = parseTimeToMinutes(parts[0]);
        const closeMinutes = parseTimeToMinutes(parts[1]);
        
        if (closeMinutes < openMinutes) {
            // Skenario jam operasional melewati tengah malam
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }
        
        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } catch (e) {
        console.warn("Format jam operasional salah:", targetJam);
        return null;
    }
}

function getDayScheduleText(dayName, jamOperasional, hariOperasional, jamOperasionalKhusus) {
    if (hariOperasional && hariOperasional.trim() !== "") {
        const hariBukaList = hariOperasional.toLowerCase().split(",").map(d => d.trim());
        if (!hariBukaList.includes(dayName.toLowerCase())) {
            return "Tutup";
        }
    }
    
    if (jamOperasionalKhusus && jamOperasionalKhusus.trim() !== "") {
        const rules = jamOperasionalKhusus.split(",");
        for (let rule of rules) {
            const parts = rule.split(":");
            if (parts.length >= 2) {
                const dayKey = parts[0].trim().toLowerCase();
                if (dayKey === dayName.toLowerCase()) {
                    const timeValue = parts.slice(1).join(":").trim();
                    return timeValue;
                }
            }
        }
    }
    
    return jamOperasional && jamOperasional.trim() !== "" ? jamOperasional : "Tutup";
}

function createWeeklyScheduleHTML(item, context) {
    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const now = new Date();
    const daysOfWeekEng = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayName = daysOfWeekEng[now.getDay()];
    
    let html = `<div class="schedule-dropdown schedule-dropdown-${context}" id="schedule-${context}-${item.id}" style="display: none;" onclick="event.stopPropagation();">`;
    
    days.forEach(day => {
        const schedText = getDayScheduleText(day, item.jamOperasional, item.hariOperasional, item.jamOperasionalKhusus);
        const isToday = day.toLowerCase() === todayName.toLowerCase();
        const rowClass = isToday ? 'schedule-row today-row' : 'schedule-row';
        const todayLabel = isToday ? ' (Hari Ini)' : '';
        const statusDot = schedText.toLowerCase() === 'tutup' ? 
            `<span class="schedule-dot dot-closed"></span>` : 
            `<span class="schedule-dot dot-open"></span>`;
            
        html += `
            <div class="${rowClass}">
                <span class="day-name">${statusDot} ${day}${todayLabel}</span>
                <span class="day-time">${schedText}</span>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

function toggleSchedule(id, btnElement, context) {
    const dropdown = document.getElementById(`schedule-${context}-${id}`);
    if (dropdown) {
        const isHidden = dropdown.style.display === "none" || dropdown.style.display === "";
        
        // Tutup semua schedule dropdown lainnya di context yang sama agar rapi
        document.querySelectorAll(`.schedule-dropdown-${context}`).forEach(el => {
            if (el.id !== `schedule-${context}-${id}`) {
                el.style.display = "none";
            }
        });
        
        // Cari status-toggle-btn di context yang sama
        const toggleButtons = context === 'card' ? 
            document.querySelectorAll(".umkm-card .status-toggle-btn") : 
            document.querySelectorAll(".leaflet-popup .status-toggle-btn");
            
        toggleButtons.forEach(btn => {
            if (btn !== btnElement) {
                btn.classList.remove("active-toggle");
            }
        });

        if (isHidden) {
            dropdown.style.display = "flex";
            dropdown.style.flexDirection = "column";
            btnElement.classList.add("active-toggle");
        } else {
            dropdown.style.display = "none";
            btnElement.classList.remove("active-toggle");
        }
    }
}
window.toggleSchedule = toggleSchedule;

// Buka Modal Cerita UMKM
function openStoryModal(id) {
    const item = umkmData.find(u => u.id === id);
    if (!item) return;

    const modal = document.getElementById("story-modal");
    const imgContainer = document.getElementById("story-img-container");
    const gallery = document.getElementById("story-gallery");
    const dotsContainer = document.getElementById("gallery-dots");
    const prevBtn = document.getElementById("prev-image-btn");
    const nextBtn = document.getElementById("next-image-btn");
    const category = document.getElementById("story-category");
    const title = document.getElementById("story-title");
    const text = document.getElementById("story-text");
    const waBtn = document.getElementById("story-wa-btn");
    const mapsBtn = document.getElementById("story-maps-btn");

    // Atur Galeri Foto
    gallery.innerHTML = "";
    dotsContainer.innerHTML = "";
    gallery.scrollLeft = 0; // Reset scroll position to first image
    
    if (item.photoUrls && item.photoUrls.length > 0) {
        item.photoUrls.forEach((url, index) => {
            const img = document.createElement("img");
            img.src = url;
            img.alt = `${item.name} - ${index + 1}`;
            img.referrerPolicy = "no-referrer";
            img.onerror = () => img.style.display = "none";
            gallery.appendChild(img);
        });
        
        if (item.photoUrls.length > 1) {
            dotsContainer.style.display = "flex";
            if (prevBtn) prevBtn.style.display = "flex";
            if (nextBtn) nextBtn.style.display = "flex";

            item.photoUrls.forEach((_, index) => {
                const dot = document.createElement("span");
                dot.className = `gallery-dot ${index === 0 ? 'active' : ''}`;
                dotsContainer.appendChild(dot);
            });
            
            // Event listener scroll untuk update dot aktif
            gallery.onscroll = () => {
                const width = gallery.clientWidth;
                const activeIndex = Math.round(gallery.scrollLeft / width);
                const dots = dotsContainer.querySelectorAll(".gallery-dot");
                dots.forEach((dot, idx) => {
                    if (idx === activeIndex) {
                        dot.classList.add("active");
                    } else {
                        dot.classList.remove("active");
                    }
                });
            };

            // Event listener tombol panah navigasi galeri
            if (prevBtn) {
                prevBtn.onclick = (e) => {
                    e.stopPropagation();
                    const width = gallery.clientWidth;
                    gallery.scrollBy({ left: -width, behavior: 'smooth' });
                };
            }
            if (nextBtn) {
                nextBtn.onclick = (e) => {
                    e.stopPropagation();
                    const width = gallery.clientWidth;
                    gallery.scrollBy({ left: width, behavior: 'smooth' });
                };
            }
        } else {
            dotsContainer.style.display = "none";
            if (prevBtn) prevBtn.style.display = "none";
            if (nextBtn) nextBtn.style.display = "none";
            gallery.onscroll = null;
        }
        imgContainer.style.display = "block";
    } else {
        imgContainer.style.display = "none";
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
    }

    // Atur Kategori & Jam
    category.textContent = item.category;
    // Beri kelas kategori agar warna sesuai
    const meta = categoryMeta[item.category] || { badgeClass: 'badge-default' };
    category.className = `badge ${meta.badgeClass}`;

    // Atur Konten Cerita
    title.textContent = `Kisah Inspiratif: ${item.name}`;
    text.textContent = item.ceritaUmkm || item.description;

    // Atur Link WhatsApp
    if (item.whatsapp) {
        const textMessage = encodeURIComponent(`Halo ${item.name}, saya membaca kisah inspiratif Anda di Radar UMKM Campurejo. Sukses selalu untuk usahanya!`);
        waBtn.href = `https://wa.me/${item.whatsapp}?text=${textMessage}`;
        waBtn.style.display = "flex";
    } else {
        waBtn.style.display = "none";
    }

    // Atur Link Maps
    mapsBtn.href = item.linkGmaps ? item.linkGmaps : `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;

    // Atur Tombol Favorit Modal
    const storyFavBtn = document.getElementById("story-fav-btn");
    if (storyFavBtn) {
        const updateStoryFavUI = () => {
            const isFav = favoritesList.includes(item.id);
            storyFavBtn.className = `btn btn-fav-modal ${isFav ? 'active' : ''}`;
            storyFavBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${isFav ? 'Tersimpan' : 'Favorit'}`;
        };
        updateStoryFavUI();
        storyFavBtn.onclick = () => {
            toggleFavorite(item.id);
            updateStoryFavUI();
        };
    }

    // Tampilkan Modal
    modal.style.display = "flex";
}

// Tutup Modal Cerita UMKM
function closeStoryModal() {
    document.getElementById("story-modal").style.display = "none";
}

// Bagikan Link UMKM (Copy to Clipboard)
function shareLink(id) {
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?umkm=${id}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Tautan lokasi berhasil disalin!");
    }).catch(err => {
        console.error("Gagal menyalin tautan:", err);
    });
}

// Menampilkan Toast Alert Notifikasi Kustom
function showToast(message) {
    const toast = document.getElementById("toast-alert");
    if (!toast) return;
    
    // Set teks notifikasi
    toast.querySelector("span").textContent = message;
    
    // Set ikon notifikasi
    const icon = toast.querySelector("i");
    if (icon) {
        if (message.includes("eror") || message.includes("belum") || message.includes("Gagal")) {
            icon.className = "fa-solid fa-triangle-exclamation";
            icon.style.color = "#d97706"; // Jingga warning
        } else {
            icon.className = "fa-solid fa-circle-check";
            icon.style.color = ""; // Hijau default
        }
    }
    
    toast.style.display = "flex";
    toast.style.opacity = "1";
    
    // Bersihkan timeout sebelumnya jika ada
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    
    window.toastTimeout = setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.style.display = "none";
        }, 300);
    }, 3000);
}

// Convert Google Drive preview links to direct image hotlinks (handles multiple comma-separated URLs)
function convertGoogleDriveLinks(url) {
    if (!url) return [];
    const urls = url.split(",");
    const driveRegex = /(?:https?:\/\/)?(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|docs\.google\.com\/uc\?export=download&id=)([a-zA-Z0-9_-]+)/;
    return urls.map(u => {
        const trimmed = u.trim();
        const match = trimmed.match(driveRegex);
        if (match && match[1]) {
            // Gunakan format thumbnail yang tidak memblokir localhost / semua origin
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=s800`;
        }
        return trimmed;
    }).filter(u => u !== "");
}

/**
 * Deteksi platform sosial media dari URL, return array of {url, icon, color, label}
 * Menerima input multi-link dipisah newline atau koma
 */
function parseSocialLinks(raw) {
    if (!raw) return [];
    // Split by newline or comma, filter empty
    const urls = raw.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith("http"));
    
    const platforms = [
        { key: "instagram",  patterns: ["instagram.com"],               icon: "fa-brands fa-instagram",  color: "#E1306C", label: "Instagram"  },
        { key: "tiktok",     patterns: ["tiktok.com"],                  icon: "fa-brands fa-tiktok",     color: "#000000", label: "TikTok"     },
        { key: "facebook",   patterns: ["facebook.com", "fb.com"],      icon: "fa-brands fa-facebook",   color: "#1877F2", label: "Facebook"   },
        { key: "youtube",    patterns: ["youtube.com", "youtu.be"],     icon: "fa-brands fa-youtube",    color: "#FF0000", label: "YouTube"    },
        { key: "twitter",    patterns: ["twitter.com", "x.com"],        icon: "fa-brands fa-x-twitter",  color: "#000000", label: "X/Twitter"  },
        { key: "shopee",     patterns: ["shopee.co.id", "shopee.com"],  icon: "fa-solid fa-bag-shopping", color: "#EE4D2D", label: "Shopee"    },
        { key: "tokopedia",  patterns: ["tokopedia.com"],               icon: "fa-solid fa-store",       color: "#03AC0E", label: "Tokopedia"  },
        { key: "bukalapak",  patterns: ["bukalapak.com"],               icon: "fa-solid fa-tag",         color: "#D73030", label: "Bukalapak"  },
        { key: "gofood",     patterns: ["gofood.co.id"],                icon: "fa-solid fa-motorcycle",  color: "#00AED6", label: "GoFood"     },
        { key: "grabfood",   patterns: ["grab.com", "grabfood"],        icon: "fa-solid fa-motorcycle",  color: "#00B14F", label: "GrabFood"   },
        { key: "lazada",     patterns: ["lazada.co.id"],                icon: "fa-solid fa-box",         color: "#0F146D", label: "Lazada"     },
        { key: "whatsapp",   patterns: ["wa.me", "whatsapp.com"],       icon: "fa-brands fa-whatsapp",   color: "#25D366", label: "WhatsApp"   },
        { key: "website",    patterns: ["http"],                        icon: "fa-solid fa-globe",       color: "#64748b", label: "Website"    }, // fallback
    ];

    return urls.map(url => {
        const lower = url.toLowerCase();
        const found = platforms.find(p => p.patterns.some(pat => lower.includes(pat)));
        return found 
            ? { url, icon: found.icon, color: found.color, label: found.label }
            : { url, icon: "fa-solid fa-globe", color: "#64748b", label: "Link" };
    });
}

// Membersihkan koordinat dari format ribuan/koma lokal (contoh: -7.145.543 menjadi -7.145543)
function cleanCoordinate(val) {
    if (val === undefined || val === null || val === '') return NaN;
    let str = val.toString().trim();
    
    // Ganti koma dengan titik desimal
    str = str.replace(',', '.');
    
    // Jika ada lebih dari satu titik, gabungkan bagian desimal setelah titik pertama
    const parts = str.split('.');
    if (parts.length > 2) {
        str = parts[0] + '.' + parts.slice(1).join('');
    }
    
    return parseFloat(str);
}

// Hitung & perbarui statistik live di Modal Info KKN
function updateInfoKKNStats() {
    const umkmStat = document.getElementById("kkn-stat-umkm");
    const catStat = document.getElementById("kkn-stat-category");
    const openStat = document.getElementById("kkn-stat-open");

    const data = (typeof umkmData !== "undefined" && umkmData.length > 0) ? umkmData : (window.umkmData || []);

    if (umkmStat) {
        umkmStat.textContent = data.length;
    }
    if (catStat) {
        const categories = new Set(data.map(u => u.category));
        catStat.textContent = categories.size;
    }
    if (openStat) {
        const openCount = data.filter(u => {
            return isCurrentlyOpen(u.jamOperasional, u.hariOperasional, u.jamOperasionalKhusus) === true;
        }).length;
        openStat.textContent = openCount;
    }
}

// Fungsi membuka & menutup Modal Info KKN
function openInfoKKNModal() {
    updateInfoKKNStats();
    const modal = document.getElementById("info-kkn-modal");
    if (modal) modal.style.display = "flex";
}

function closeInfoKKNModal() {
    const modal = document.getElementById("info-kkn-modal");
    if (modal) modal.style.display = "none";
}

// Toggle Simpan Favorit (localStorage)
function toggleFavorite(id, btnElement) {
    const index = favoritesList.indexOf(id);
    if (index > -1) {
        favoritesList.splice(index, 1);
        showToast("Dihapus dari daftar favorit");
    } else {
        favoritesList.push(id);
        showToast("Disimpan ke daftar favorit!");
    }
    localStorage.setItem("radar_umkm_favorites", JSON.stringify(favoritesList));
    
    updateFavoriteCount();

    // Update ikon di kartu
    const card = cardInstances[id];
    if (card) {
        const btn = card.querySelector(".fav-card-btn");
        if (btn) {
            const isFav = favoritesList.includes(id);
            btn.className = `fav-card-btn ${isFav ? 'active' : ''}`;
            btn.title = isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit';
            btn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
        }
    }

    if (btnElement && btnElement.classList.contains("fav-card-btn")) {
        const isFav = favoritesList.includes(id);
        btnElement.className = `fav-card-btn ${isFav ? 'active' : ''}`;
        btnElement.title = isFav ? 'Hapus dari Favorit' : 'Simpan ke Favorit';
        btnElement.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
    }

    if (isFavoritesOnly) {
        renderAppContent();
    }
}

function updateFavoriteCount() {
    const favCountEl = document.getElementById("fav-count");
    if (favCountEl) {
        favCountEl.textContent = favoritesList.length;
    }
}

// Daftarkan ke Global Scope
window.openStoryModal = openStoryModal;
window.shareLink = shareLink;
window.openInfoKKNModal = openInfoKKNModal;
window.closeInfoKKNModal = closeInfoKKNModal;
window.toggleFavorite = toggleFavorite;

// Global Drag-to-Scroll utilitas menggunakan mouse (Desktop UX)
let activeDragEl = null;
let dragStartX = 0;
let dragScrollLeft = 0;
let isDraggingMoved = false;

document.addEventListener('mousedown', (e) => {
    // Cari elemen terdekat yang memiliki scroll horizontal
    const container = e.target.closest('.category-tabs, .story-gallery, .popup-gallery');
    if (!container) return;
    
    // Abaikan jika yang diklik adalah tombol navigasi atau link
    if (e.target.closest('button, a')) return;

    activeDragEl = container;
    isDraggingMoved = false;
    activeDragEl.style.scrollBehavior = 'auto';
    dragStartX = e.pageX - activeDragEl.offsetLeft;
    dragScrollLeft = activeDragEl.scrollLeft;
});

document.addEventListener('mouseleave', () => {
    if (activeDragEl) {
        activeDragEl.style.scrollBehavior = 'smooth';
        activeDragEl = null;
    }
});

document.addEventListener('mouseup', () => {
    if (activeDragEl) {
        activeDragEl.style.scrollBehavior = 'smooth';
        activeDragEl = null;
    }
});

document.addEventListener('mousemove', (e) => {
    if (!activeDragEl) return;
    e.preventDefault();
    const x = e.pageX - activeDragEl.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    if (Math.abs(walk) > 3) {
        isDraggingMoved = true;
        activeDragEl.scrollLeft = dragScrollLeft - walk;
    }
});

// Cegah klik terpicu pada elemen anak jika pengguna sebenarnya melakukan geser (drag)
document.addEventListener('click', (e) => {
    if (isDraggingMoved) {
        e.preventDefault();
        e.stopPropagation();
        isDraggingMoved = false;
    }
}, true);

// Konversi scroll wheel vertikal mouse menjadi scroll horizontal di desktop
document.addEventListener('wheel', (e) => {
    const container = e.target.closest('.category-tabs, .story-gallery, .popup-gallery');
    if (!container) return;
    
    if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
    }
}, { passive: false });

// Pasang event listener penutup modal
document.addEventListener("DOMContentLoaded", () => {
    updateFavoriteCount();
    // 1. Event listener Modal Kisah
    const closeBtn = document.getElementById("close-story-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeStoryModal);
    
    const modal = document.getElementById("story-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeStoryModal();
        });
    }

    // 2. Event listener Modal Info KKN
    const infoBtn = document.getElementById("info-kkn-btn");
    if (infoBtn) infoBtn.addEventListener("click", openInfoKKNModal);

    const closeInfoBtn = document.getElementById("close-info-kkn-btn");
    if (closeInfoBtn) closeInfoBtn.addEventListener("click", closeInfoKKNModal);

    const infoModal = document.getElementById("info-kkn-modal");
    if (infoModal) {
        infoModal.addEventListener("click", (e) => {
            if (e.target === infoModal) closeInfoKKNModal();
        });
    }
});

