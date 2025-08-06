const db = require("../../databases");

/**
 * Obtiene el estado actual del mercado de pases.
 * Esta es la nueva lógica que considera el estado manual.
 */
exports.getEstadoMercado = async (req, res) => {
    try {
        const [[mercado]] = await db.query("SELECT * FROM mercado WHERE id = 1");

        if (!mercado) {
            return res.status(404).json({ error: 'Configuración del mercado no encontrada.' });
        }

        let estaAbierto = false;
        const ahora = new Date();

        if (mercado.estado === 'abierto_manual') {
            estaAbierto = true;
        } else if (mercado.estado === 'cerrado_manual') {
            estaAbierto = false;
        } else { // estado 'automatico'
            const inicio = mercado.fecha_inicio ? new Date(mercado.fecha_inicio) : null;
            const fin = mercado.fecha_fin ? new Date(mercado.fecha_fin) : null;
            if (inicio && fin) {
                estaAbierto = ahora >= inicio && ahora <= fin;
            }
        }

        res.json({
            abierto: estaAbierto,
            estado: mercado.estado,
            fecha_inicio: mercado.fecha_inicio,
            fecha_fin: mercado.fecha_fin
        });

    } catch (error) {
        logger.error(`Error en getEstadoMercado: ${error.message}`, { error });
        res.status(500).json({ error: 'Error al obtener el estado del mercado.' });
    }
};