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
const markerInstances = {}; // Menyimpan instansi marker berdasarkan id_unik untuk pencarian / deep-linking

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
        attributionControl: true
    }).setView(CAMPUREJO_CENTER, DEFAULT_ZOOM);

    // Gunakan Tile Layer CartoDB Positron (OSM-based, modern, clean, gratis)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
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
    const urlToFetch = GOOGLE_SHEET_CSV_URL ? GOOGLE_SHEET_CSV_URL : LOCAL_FALLBACK_CSV;
    
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
                        ceritaUmkm: item.cerita_umkm ? item.cerita_umkm.trim() : "",
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
    // 1. Bersihkan markers di peta & list di UI
    markersLayer.clearLayers();
    const listContainer = document.getElementById("umkm-list");
    listContainer.innerHTML = "";
    
    // 2. Filter data berdasarkan kategori aktif dan query pencarian
    const filteredData = umkmData.filter(item => {
        const matchesCategory = (activeCategory === "all" || item.category.toLowerCase() === activeCategory.toLowerCase());
        
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch = searchQuery === "" || 
            item.name.toLowerCase().includes(searchLower) ||
            item.category.toLowerCase().includes(searchLower) ||
            item.description.toLowerCase().includes(searchLower);
            
        return matchesCategory && matchesSearch;
    });

    // Perbarui jumlah UMKM yang ditemukan
    document.getElementById("umkm-count").textContent = filteredData.length;

    if (filteredData.length === 0) {
        document.getElementById("empty-state").style.display = "block";
        listContainer.style.display = "none";
        return;
    }

    document.getElementById("empty-state").style.display = "none";
    listContainer.style.display = "flex";

    // 3. Render markers & list cards
    filteredData.forEach(item => {
        // A. Pembuatan Marker Kustom Leaflet (hanya jika koordinat valid)
        if (item.hasValidCoords) {
            const marker = createCustomMarker(item);
            markersLayer.addLayer(marker);
            
            // Simpan instansi marker ke global registry untuk akses deep-link / sidebar klik
            markerInstances[item.id] = marker;
        }

        // B. Pembuatan Card untuk Sidebar List
        const card = createUMKMCard(item);
        listContainer.appendChild(card);
    });
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
    if (item.photoUrl) {
        photoHTML = `<img src="${item.photoUrl}" alt="${item.name}" class="popup-img" onerror="this.style.display='none'">`;
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
    const openState = isCurrentlyOpen(item.jamOperasional);
    if (openState !== null) {
        statusHTML = openState ? 
            `<span class="status-badge status-open" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px;"><i class="fa-solid fa-circle"></i> Buka (${item.jamOperasional})</span>` :
            `<span class="status-badge status-closed" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 6px;"><i class="fa-regular fa-circle"></i> Tutup (${item.jamOperasional})</span>`;
    }

    return `
        <div class="popup-container">
            ${photoHTML}
            <div class="popup-body">
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;">
                    <span class="badge ${meta.badgeClass}">${item.category}</span>
                    ${statusHTML}
                </div>
                <h3 class="popup-title">${item.name}</h3>
                <p class="popup-desc">${item.description}</p>
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
        const openState = isCurrentlyOpen(item.jamOperasional);
        if (openState !== null) {
            statusHTML = openState ? 
                `<span class="status-badge status-open"><i class="fa-solid fa-circle"></i> Buka (${item.jamOperasional})</span>` :
                `<span class="status-badge status-closed"><i class="fa-regular fa-circle"></i> Tutup (${item.jamOperasional})</span>`;
        }
    }

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

    // D. Tombol Share Link
    const shareBtnHTML = `
        <button class="share-card-btn" onclick="event.stopPropagation(); shareLink('${item.id}')" aria-label="Bagikan lokasi">
            <i class="fa-regular fa-share-from-square"></i>
        </button>
    `;

    // E. Indikator Peta
    const mapIndicatorHTML = item.hasValidCoords ? 
        `<span style="color: var(--neutral-medium); font-size: 0.7rem;"><i class="fa-solid fa-location-dot"></i> Lihat Peta</span>` :
        `<span style="color: var(--neutral-medium); font-size: 0.7rem; opacity: 0.6;"><i class="fa-solid fa-location-pin-slash"></i> Peta Tidak Tersedia</span>`;

    card.innerHTML = `
        <div class="umkm-card-header">
            <div>
                <h3 class="umkm-card-name">${item.name}</h3>
                <div style="display: flex; gap: 8px; margin-top: 4px; align-items: center;">
                    <span class="badge ${meta.badgeClass}">${item.category}</span>
                    ${statusHTML}
                </div>
            </div>
            ${shareBtnHTML}
        </div>
        <p class="umkm-card-desc">${item.description}</p>
        ${tagsHTML}
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
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        if (searchQuery.trim().length > 0) {
            clearSearchBtn.style.display = "flex";
        } else {
            clearSearchBtn.style.display = "none";
        }
        renderAppContent();
    });

    // Tombol Bersihkan Pencarian
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchQuery = "";
        clearSearchBtn.style.display = "none";
        searchInput.focus();
        renderAppContent();
    });

    // Klik Tabs Kategori
    const categoryButtons = document.querySelectorAll(".category-tab");
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

    // Panel Bottom Sheet (Mobile Toggle)
    const toggleListBtn = document.getElementById("toggle-list-btn");
    const listPanel = document.getElementById("list-panel");
    const listHeader = document.querySelector(".list-header");

    const toggleBottomSheet = () => {
        if (window.innerWidth <= 768) {
            listPanel.classList.toggle("collapsed");
            const isCollapsed = listPanel.classList.contains("collapsed");
            toggleListBtn.innerHTML = isCollapsed ? 
                '<i class="fa-solid fa-chevron-up"></i>' : 
                '<i class="fa-solid fa-chevron-down"></i>';
        }
    };

    toggleListBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBottomSheet();
    });
    
    // Mengetuk header list pada mobile juga men-toggle
    listHeader.addEventListener("click", () => {
        toggleBottomSheet();
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

// Menghitung status buka/tutup berdasarkan jam operasional (Format: "HH:MM - HH:MM")
function isCurrentlyOpen(jamOperasional) {
    if (!jamOperasional || jamOperasional.trim() === "") return null;
    try {
        const parts = jamOperasional.split("-");
        if (parts.length !== 2) return null;
        
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        const parseTimeToMinutes = (timeStr) => {
            const timeParts = timeStr.trim().split(":");
            return parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        };
        
        const openMinutes = parseTimeToMinutes(parts[0]);
        const closeMinutes = parseTimeToMinutes(parts[1]);
        
        if (closeMinutes < openMinutes) {
            // Skenario jam operasional melewati tengah malam (misal 18:00 - 02:00)
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }
        
        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } catch (e) {
        console.warn("Format jam operasional salah:", jamOperasional);
        return null;
    }
}

// Buka Modal Cerita UMKM
function openStoryModal(id) {
    const item = umkmData.find(u => u.id === id);
    if (!item) return;

    const modal = document.getElementById("story-modal");
    const imgContainer = document.getElementById("story-img-container");
    const gallery = document.getElementById("story-gallery");
    const dotsContainer = document.getElementById("gallery-dots");
    const category = document.getElementById("story-category");
    const title = document.getElementById("story-title");
    const text = document.getElementById("story-text");
    const waBtn = document.getElementById("story-wa-btn");
    const mapsBtn = document.getElementById("story-maps-btn");

    // Atur Galeri Foto
    gallery.innerHTML = "";
    dotsContainer.innerHTML = "";
    
    if (item.photoUrls && item.photoUrls.length > 0) {
        item.photoUrls.forEach((url, index) => {
            const img = document.createElement("img");
            img.src = url;
            img.alt = `${item.name} - ${index + 1}`;
            img.onerror = () => img.style.display = "none";
            gallery.appendChild(img);
        });
        
        if (item.photoUrls.length > 1) {
            dotsContainer.style.display = "flex";
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
        } else {
            dotsContainer.style.display = "none";
        }
        imgContainer.style.display = "block";
    } else {
        imgContainer.style.display = "none";
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
            return `https://lh3.googleusercontent.com/d/${match[1]}`;
        }
        return trimmed;
    }).filter(u => u !== "");
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

// Fungsi membuka & menutup Modal Info KKN
function openInfoKKNModal() {
    const modal = document.getElementById("info-kkn-modal");
    if (modal) modal.style.display = "flex";
}

function closeInfoKKNModal() {
    const modal = document.getElementById("info-kkn-modal");
    if (modal) modal.style.display = "none";
}

// Daftarkan ke Global Scope
window.openStoryModal = openStoryModal;
window.shareLink = shareLink;
window.openInfoKKNModal = openInfoKKNModal;
window.closeInfoKKNModal = closeInfoKKNModal;

// Pasang event listener penutup modal
document.addEventListener("DOMContentLoaded", () => {
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

