const request = require('supertest');
// ✅ CORRECCIÓN: Apuntamos a 'server.js' porque así se llama tu archivo principal
const app = require('../server'); 
const db = require('../databases');

describe('Endpoints de Usuarios', () => {

    beforeEach(async () => {
        // Limpiamos la tabla para que cada prueba sea independiente
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.query('TRUNCATE TABLE usuarios');
        await db.query('SET FOREIGN_KEY_CHECKS = 1');
    });

    afterAll(async () => {
        // Cerramos la conexión a la base de datos al final de todas las pruebas
        await db.end();
    });

    // --- Pruebas para POST /api/usuarios/register ---

    it('debería registrar un nuevo usuario correctamente', async () => {
        const response = await request(app)
            .post('/api/usuarios/register')
            .send({
                email: 'test@example.com',
                password: 'password1234',
                nombre_in_game: 'TestPlayer',
                posicion: 'Delantero' // Asegúrate de incluir todos los campos obligatorios
            });

        expect(response.statusCode).toBe(201);
        expect(response.body.message).toBe('Usuario registrado correctamente');
    });

    it('debería devolver un error 409 si el email ya existe', async () => {
        // Primero, creamos un usuario
        await request(app)
            .post('/api/usuarios/register')
            .send({
                email: 'test@example.com',
                password: 'password1234',
                nombre_in_game: 'TestPlayer',
                posicion: 'Delantero'
            });

        // Luego, intentamos crear otro con el mismo email
        const response = await request(app)
            .post('/api/usuarios/register')
            .send({
                email: 'test@example.com',
                password: 'anotherpassword',
                nombre_in_game: 'AnotherPlayer',
                posicion: 'Defensor'
            });

        expect(response.statusCode).toBe(409);
        expect(response.body.error).toBe('El email ya está en uso');
    });

    it('debería devolver un error 400 si la contraseña es muy corta', async () => {
        const response = await request(app)
            .post('/api/usuarios/register')
            .send({
                email: 'shortpass@example.com',
                password: '123', // Contraseña demasiado corta
                nombre_in_game: 'ShortPass',
                posicion: 'Mediocampista'
            });
        
        expect(response.statusCode).toBe(400);
        // Verificamos que el array de errores contenga el mensaje correcto
        expect(response.body.errors[0].msg).toBe('La contraseña debe tener al menos 8 caracteres.');
    });
});