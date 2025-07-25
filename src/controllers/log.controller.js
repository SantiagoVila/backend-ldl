const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Obtiene y procesa los registros del archivo de logs.
 */
exports.getLogs = async (req, res) => {
    const logs = [];
    const logFilePath = path.join(__dirname, '../../combined.log');

    try {
        // Verificamos si el archivo de log existe
        if (!fs.existsSync(logFilePath)) {
            return res.json([]);
        }

        // Usamos readline para leer el archivo línea por línea, que es más eficiente
        const fileStream = fs.createReadStream(logFilePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            try {
                if (line) { // Ignoramos líneas vacías
                    logs.push(JSON.parse(line));
                }
            } catch (e) {
                console.error('Error al parsear una línea del log:', line, e);
            }
        }

        // Devolvemos los logs en orden cronológico inverso (los más nuevos primero)
        res.json(logs.reverse());

    } catch (error) {
        console.error('Error al leer el archivo de logs:', error);
        res.status(500).json({ error: 'No se pudo leer el historial de acciones.' });
    }
};
