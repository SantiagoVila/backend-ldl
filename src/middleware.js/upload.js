const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Nos aseguramos de que la carpeta de destino exista
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento para Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// ✅ CAMBIO: Usamos multer sin un campo específico para que procese todo el formulario.
const upload = multer({ storage: storage });

module.exports = upload;
