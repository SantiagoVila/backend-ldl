// src/services/fixture.service.js

/**
 * ✅ MEJORADO: Genera un calendario de partidos de todos contra todos a IDA Y VUELTA.
 * @param {Array} equipos - Un array de objetos, cada uno con un 'id'.
 * @returns {Array} Un array de objetos de partido.
 */
exports.generarPartidosRoundRobin = (equipos) => {
    const partidosIda = [];
    if (equipos.length < 2) return [];

    let equiposParaFixture = [...equipos];
    if (equiposParaFixture.length % 2 !== 0) {
        equiposParaFixture.push({ id: null, nombre: 'DESCANSO' });
    }

    const numEquipos = equiposParaFixture.length;
    const numJornadasIda = numEquipos - 1;

    for (let i = 0; i < numJornadasIda; i++) {
        for (let j = 0; j < numEquipos / 2; j++) {
            const local = equiposParaFixture[j];
            const visitante = equiposParaFixture[numEquipos - 1 - j];

            if (local.id !== null && visitante.id !== null) {
                partidosIda.push({ equipo_local_id: local.id, equipo_visitante_id: visitante.id, jornada: i + 1 });
            }
        }
        const ultimoEquipo = equiposParaFixture.pop();
        equiposParaFixture.splice(1, 0, ultimoEquipo);
    }

    // Generar partidos de vuelta invirtiendo la localía y ajustando la jornada
    const partidosVuelta = partidosIda.map(partido => ({
        equipo_local_id: partido.equipo_visitante_id,
        equipo_visitante_id: partido.equipo_local_id,
        jornada: partido.jornada + numJornadasIda
    }));

    return [...partidosIda, ...partidosVuelta];
};


/**
 * ✅ NUEVO: Genera la estructura de un torneo de copa por eliminación directa.
 * @param {Array} equipos - Un array de objetos de equipo. Debe ser potencia de 2 (4, 8, 16...).
 * @returns {Array} Un array de objetos de partido de copa.
 */
exports.generarPartidosCopa = (equipos) => {
    const FASES_COPA = { 2: 'Final', 4: 'Semifinales', 8: 'Cuartos de Final', 16: 'Octavos de Final' };

    if (equipos.length < 2 || (equipos.length & (equipos.length - 1)) !== 0) {
        throw new Error('El número de equipos para la copa debe ser una potencia de 2 (4, 8, 16...).');
    }

    const todosLosPartidos = [];
    let equiposEnRonda = [...equipos].sort(() => Math.random() - 0.5); // Sorteo aleatorio
    let idPartidoLlaveGlobal = 1;
    const totalEquipos = equipos.length;

    while (equiposEnRonda.length >= 1) {
        const numPartidosEnRonda = equiposEnRonda.length / 2;
        if (numPartidosEnRonda < 1) break;

        const nombreFase = FASES_COPA[equiposEnRonda.length] || `Ronda de ${equiposEnRonda.length}`;
        const partidosDeFase = [];

        for (let i = 0; i < equiposEnRonda.length; i += 2) {
            const local = equiposEnRonda[i];
            const visitante = equiposEnRonda[i + 1];

            // Calculamos el ID del partido al que avanzará el ganador
            const idSiguiente = totalEquipos - 1 + Math.floor(idPartidoLlaveGlobal / 2) + 1;
            
            partidosDeFase.push({
                equipo_local_id: typeof local.id === 'number' ? local.id : null,
                equipo_visitante_id: typeof visitante.id === 'number' ? visitante.id : null,
                fase: nombreFase,
                id_partido_llave: idPartidoLlaveGlobal,
                id_siguiente_partido_llave: nombreFase !== 'Final' ? idSiguiente : null
            });
            idPartidoLlaveGlobal++;
        }
        
        todosLosPartidos.push(...partidosDeFase);
        
        const equiposSiguienteRonda = partidosDeFase.map(p => ({
            id: `GANADOR_P${p.id_partido_llave}`
        }));
        
        equiposEnRonda = equiposSiguienteRonda;
    }

    return todosLosPartidos;
};
