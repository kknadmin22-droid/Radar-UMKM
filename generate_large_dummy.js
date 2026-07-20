const fs = require('fs');
const path = require('path');

// Target file
const targetPath = path.join(__dirname, 'data', 'dummy_umkm_large.csv');

// Campurejo approximate boundaries
// Longitude: 111.892 to 111.915
// Latitude: -7.158 to -7.138
const latMin = -7.158;
const latMax = -7.138;
const lngMin = 111.892;
const lngMax = 111.915;

const categories = ['Kuliner', 'Jasa', 'Kerajinan', 'Pertanian', 'Belanja'];

const firstNames = [
    'Warung', 'Toko', 'Bengkel', 'Kios', 'Depot', 'Sate', 'Bakso', 'Nasi Goreng', 'Soto',
    'Salon', 'Laundry', 'Jahit', 'Fotokopi', 'Batik', 'Anyaman', 'Tani', 'Bibit', 'Pupuk'
];

const lastNames = [
    'Makmur', 'Berkah', 'Jaya', 'Sentosa', 'Lancar', 'Sumber Rejeki', 'Barokah', 'Murni',
    'Indah', 'Lestari', 'Subur', 'Sejahtera', 'Utama', 'Mandiri', 'Sari', 'Rasa', 'Nikmat'
];

const descriptions = {
    'Kuliner': 'Menyediakan aneka hidangan makanan dan minuman lezat khas Nusantara dengan harga merakyat.',
    'Jasa': 'Melayani jasa perbaikan, perawatan, dan kebutuhan teknis harian Anda secara cepat dan profesional.',
    'Kerajinan': 'Memproduksi kerajinan tangan berkualitas tinggi berbahan lokal untuk hiasan dan peralatan rumah.',
    'Pertanian': 'Menyediakan berbagai kebutuhan sarana pertanian, bibit unggul, dan pupuk organik berkualitas.',
    'Belanja': 'Menjual barang kebutuhan sehari-hari lengkap, sembako murah, dan kebutuhan rumah tangga.'
};

const produkUnggulan = {
    'Kuliner': ['Nasi Pecel', 'Bakso Urat', 'Mie Ayam', 'Es Teh', 'Gorengan Hangat', 'Soto Ayam', 'Sate Kambing'],
    'Jasa': ['Servis Elektronik', 'Cuci Pakaian', 'Potong Rambut', 'Jahit Baju', 'Instalasi Listrik'],
    'Kerajinan': ['Keranjang Bambu', 'Kain Batik', 'Hiasan Dinding', 'Tampah', 'Caping'],
    'Pertanian': ['Pupuk Organik', 'Bibit Padi', 'Bibit Jagung', 'Pestisida Alami', 'Alat Tani'],
    'Belanja': ['Beras Premium', 'Minyak Goreng', 'Gula Pasir', 'Gas LPG 3kg', 'Sembako']
};

const jamOperasional = ['06:00 - 15:00', '08:00 - 17:00', '09:00 - 21:00', '07:00 - 16:00', '05:00 - 22:00', '10:00 - 22:00'];

const countArg = process.argv[2];
const numRecords = countArg && !isNaN(parseInt(countArg, 10)) ? parseInt(countArg, 10) : 1000;

const headers = 'nama_usaha,kategori,deskripsi,latitude,longitude,kontak_wa,link_foto,link_gmaps,id_unik,produk_unggulan,jam_operasional,cerita_umkm';
let rows = [headers];

for (let i = 1; i <= numRecords; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} #${i}`;
    const desc = descriptions[category];
    const lat = (Math.random() * (latMax - latMin) + latMin).toFixed(6);
    const lng = (Math.random() * (lngMax - lngMin) + lngMin).toFixed(6);
    const wa = '081234567' + String(100 + i);
    const photo = Math.random() > 0.5 ? 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=500' : '';
    const maps = '';
    const id = `umkm-test-${i}`;
    
    // Pick 2-3 products randomly
    const prodList = produkUnggulan[category];
    const pickedProds = [];
    const numProds = Math.floor(Math.random() * 2) + 2; // 2 or 3
    while (pickedProds.length < numProds) {
        const prod = prodList[Math.floor(Math.random() * prodList.length)];
        if (!pickedProds.includes(prod)) {
            pickedProds.push(prod);
        }
    }
    const prods = pickedProds.join(', ');
    
    const jam = jamOperasional[Math.floor(Math.random() * jamOperasional.length)];
    const cerita = `Ini adalah kisah perjuangan UMKM ${name} yang didirikan untuk melayani kebutuhan masyarakat sekitar Campurejo dengan dedikasi tinggi.`;

    // Escape quotes in name/desc/cerita
    const escapedName = `"${name.replace(/"/g, '""')}"`;
    const escapedDesc = `"${desc.replace(/"/g, '""')}"`;
    const escapedCerita = `"${cerita.replace(/"/g, '""')}"`;
    const escapedProds = `"${prods.replace(/"/g, '""')}"`;

    rows.push(`${escapedName},${category},${escapedDesc},${lat},${lng},${wa},${photo},${maps},${id},${escapedProds},${jam},${escapedCerita}`);
}

fs.writeFileSync(targetPath, rows.join('\n'), 'utf8');
console.log(`Successfully generated ${numRecords} dummy UMKM records at: ${targetPath}`);
