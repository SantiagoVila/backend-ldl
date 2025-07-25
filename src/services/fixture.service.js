// src/services/fixture.service.js

/**
 * Genera un calendario de partidos de todos contra todos (round-robin).
 * @param {Array} equipos - Un array de objetos, cada uno con un 'id'.
 * @returns {Array} Un array de objetos de partido, cada uno con { equipo_local_id, equipo_visitante_id }.
 */
exports.generarPartidosRoundRobin = (equipos) => {
    const partidos = [];
    if (equipos.length < 2) return partidos;

    // Si el número de equipos es impar, se añade un equipo "fantasma" para que todos descansen una jornada.
    let equiposLocales = [...equipos];
    if (equiposLocales.length % 2 !== 0) {
        equiposLocales.push({ id: null, nombre: 'DESCANSO' }); // Equipo fantasma
    }

    const numJornadas = equiposLocales.length - 1;
    const numPartidosPorJornada = equiposLocales.length / 2;

    for (let i = 0; i < numJornadas; i++) {
        for (let j = 0; j < numPartidosPorJornada; j++) {
            const local = equiposLocales[j];
            const visitante = equiposLocales[equiposLocales.length - 1 - j];

            // No creamos partidos contra el equipo fantasma
            if (local.id !== null && visitante.id !== null) {
                // Alternar localía para que sea más justo
                if (i % 2 === 0) {
                    partidos.push({ equipo_local_id: local.id, equipo_visitante_id: visitante.id, jornada: i + 1 });
                } else {
                    partidos.push({ equipo_local_id: visitante.id, equipo_visitante_id: local.id, jornada: i + 1 });
                }
            }
        }

        // Rotar los equipos manteniendo el primero fijo
        const ultimoEquipo = equiposLocales.pop();
        equiposLocales.splice(1, 0, ultimoEquipo);
    }

    return partidos;
};