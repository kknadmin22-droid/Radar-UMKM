/**
 * Build Script: Jamstack Data Cacher & Technical SEO Generator
 * Pulls Google Sheet CSV -> Converts to data/umkm.json -> Generates sitemap.xml
 */

const fs = require('fs');
const path = require('path');

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTMM5fdKJE77Mq-ZcsfHCRo0QRRNDmP_SGb2pG8vpppWyq_xjDlqi4nMVEsPLJE8Gi_5kxpkgFpYdXY/pub?gid=1194202036&single=true&output=csv";
const OUTPUT_JSON_PATH = path.join(__dirname, '../data/umkm.json');
const OUTPUT_SITEMAP_PATH = path.join(__dirname, '../sitemap.xml');

// Simple CSV parser
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];
    
    // Split headers handling quotes
    const headers = parseCSVLine(lines[0]);
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const currentLine = parseCSVLine(lines[i]);
        if (currentLine.length < headers.length) continue;

        const obj = {};
        headers.forEach((header, index) => {
            obj[header.trim()] = currentLine[index] ? currentLine[index].trim() : '';
        });
        results.push(obj);
    }
    return results;
}

function parseCSVLine(text) {
    const result = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
            result.push(cell);
            cell = '';
        } else {
            cell += c;
        }
    }
    result.push(cell);
    return result;
}

async function buildDataAndSEO() {
    console.log("🚀 [Jamstack Build] Fetching data from Google Sheets...");
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        if (!response.ok) throw new Error(`HTTP error status: ${response.status}`);
        const csvText = await response.text();

        const umkmList = parseCSV(csvText);
        console.log(`✅ Successfully fetched ${umkmList.length} UMKM items.`);

        // Ensure data dir exists
        const dataDir = path.dirname(OUTPUT_JSON_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Save JSON
        fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(umkmList, null, 2), 'utf-8');
        console.log(`💾 Saved cached JSON to: ${OUTPUT_JSON_PATH}`);

        // Generate Sitemap.xml
        generateSitemap(umkmList);

    } catch (err) {
        console.error("❌ [Jamstack Build Failed]:", err.message);
        process.exit(1);
    }
}

function generateSitemap(umkmList = []) {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = "https://kknadmin22-droid.github.io/Radar-UMKM/";

    let urlsXml = `  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>\n`;

    // Tambahkan URL Deep-link per UMKM ke sitemap
    umkmList.forEach(item => {
        const slug = item.id_unik ? item.id_unik.trim() : (item.nama_usaha ? item.nama_usaha.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '');
        if (slug) {
            urlsXml += `  <url>
    <loc>${baseUrl}#umkm=${encodeURIComponent(slug)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
        }
    });

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}</urlset>`;

    fs.writeFileSync(OUTPUT_SITEMAP_PATH, sitemapContent, 'utf-8');
    console.log(`🗺️ Generated sitemap.xml (${umkmList.length + 1} URLs) at: ${OUTPUT_SITEMAP_PATH}`);
}

buildDataAndSEO();
