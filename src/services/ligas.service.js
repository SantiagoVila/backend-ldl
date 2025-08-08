/**
 * ✅ FUNCIÓN CORREGIDA v2.2
 * Genera las consultas SQL para actualizar la tabla de posiciones usando consultas parametrizadas,
 * que es un método más seguro y robusto.
 */
exports.generarQueriesActualizacionTabla = (partido) => {
    const { liga_id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante } = partido;

    // Validación para asegurar que todos los datos necesarios están presentes.
    if (liga_id == null || equipo_local_id == null || equipo_visitante_id == null || goles_local == null || goles_visitante == null) {
        console.error("generarQueriesActualizacionTabla: Faltan datos cruciales para actualizar la tabla.", partido);
        return []; 
    }

    const resultadoLocal = goles_local > goles_visitante ? 'G' : goles_local < goles_visitante ? 'P' : 'E';
    const resultadoVisitante = goles_local < goles_visitante ? 'G' : goles_local > goles_visitante ? 'P' : 'E';

    const queries = [];

    // --- Query para el equipo local ---
    const sqlLocal = `
        INSERT INTO tabla_posiciones (liga_id, equipo_id, partidos_jugados, partidos_ganados, partidos_empatados, partidos_perdidos, goles_a_favor, goles_en_contra, diferencia_goles, puntos)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            partidos_jugados = partidos_jugados + 1,
            partidos_ganados = partidos_ganados + VALUES(partidos_ganados),
            partidos_empatados = partidos_empatados + VALUES(partidos_empatados),
            partidos_perdidos = partidos_perdidos + VALUES(partidos_perdidos),
            goles_a_favor = goles_a_favor + VALUES(goles_a_favor),
            goles_en_contra = goles_en_contra + VALUES(goles_en_contra),
            diferencia_goles = diferencia_goles + VALUES(diferencia_goles),
            puntos = puntos + VALUES(puntos);
    `;
    const valuesLocal = [
        liga_id,
        equipo_local_id,
        resultadoLocal === 'G' ? 1 : 0,
        resultadoLocal === 'E' ? 1 : 0,
        resultadoLocal === 'P' ? 1 : 0,
        goles_local,
        goles_visitante,
        goles_local - goles_visitante,
        resultadoLocal === 'G' ? 3 : resultadoLocal === 'E' ? 1 : 0
    ];
    queries.push({ sql: sqlLocal, values: valuesLocal });

    // --- Query para el equipo visitante ---
    const sqlVisitante = `
        INSERT INTO tabla_posiciones (liga_id, equipo_id, partidos_jugados, partidos_ganados, partidos_empatados, partidos_perdidos, goles_a_favor, goles_en_contra, diferencia_goles, puntos)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            partidos_jugados = partidos_jugados + 1,
            partidos_ganados = partidos_ganados + VALUES(partidos_ganados),
            partidos_empatados = partidos_empatados + VALUES(partidos_empatados),
            partidos_perdidos = partidos_perdidos + VALUES(partidos_perdidos),
            goles_a_favor = goles_a_favor + VALUES(goles_a_favor),
            goles_en_contra = goles_en_contra + VALUES(goles_en_contra),
            diferencia_goles = diferencia_goles + VALUES(diferencia_goles),
            puntos = puntos + VALUES(puntos);
    `;
    const valuesVisitante = [
        liga_id,
        equipo_visitante_id,
        resultadoVisitante === 'G' ? 1 : 0,
        resultadoVisitante === 'E' ? 1 : 0,
        resultadoVisitante === 'P' ? 1 : 0,
        goles_visitante,
        goles_local,
        goles_visitante - goles_local,
        resultadoVisitante === 'G' ? 3 : resultadoVisitante === 'E' ? 1 : 0
    ];
    queries.push({ sql: sqlVisitante, values: valuesVisitante });

    return queries;
};
