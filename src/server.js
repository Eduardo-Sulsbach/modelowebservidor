import http from 'node:http';
import { manipuladorDeRotas } from './routes.js';
import { json } from './middlewares/json.js';

const porta = Number(process.env.PORT) || 3333;

const server = http.createServer(async (request, response) => {
  try {
    await json(request, response);
    await manipuladorDeRotas(request, response);
  } catch (erro) {
    console.error('Erro no servidor:', erro);

    if (!response.headersSent) {
      response.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ erro: 'Erro interno no servidor.' }));
    }
  }
});

server.listen(porta, () => {
  console.log(`API rodando em http://localhost:${porta}`);
});