// api/leaderboard.js
import { Redis } from "@upstash/redis";

// 1. A conexão é configurada com as variáveis de ambiente
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 2. A função principal que a Vercel vai executar
export default async function handler(req, res) {

  // ROTA POST: Para salvar uma nova pontuação
  if (req.method === "POST") {
    try {
      const { name, score, difficulty } = req.body;

      // Validação simples dos dados recebidos
      if (!name || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ error: "Dados inválidos ou faltando." });
      }

      const key = `leaderboard:${difficulty}`;
      const entry = { name, score, difficulty };

      // O comando zadd adiciona um membro a um "sorted set"
      // O score é o número usado para ordenar, e o member é o dado que guardamos
      await redis.zadd(key, {
        score: score,
        member: JSON.stringify(entry), // ESSENCIAL: Transformamos o objeto em texto JSON
      });

      return res.status(201).json({ success: true, entry });

    } catch (error) {
      console.error("Erro ao salvar no Redis:", error);
      return res.status(500).json({ error: "Falha ao salvar pontuação." });
    }
  }

  // ROTA GET: Para buscar o ranking
  if (req.method === "GET") {
    try {
      const { difficulty } = req.query;
      
      if (!difficulty) {
        return res.status(400).json({ error: "Parâmetro 'difficulty' é obrigatório." });
      }
      
      const key = `leaderboard:${difficulty}`;

      // O comando zrange busca os membros. rev: true busca do maior score para o menor.
      const range = await redis.zrange(key, 0, 9, { rev: true });

      // Mapeamos os resultados, convertendo cada texto JSON de volta para um objeto
      const leaderboard = range.map((entry) => JSON.parse(entry));
      
      return res.status(200).json(leaderboard);

    } catch (error)      {
      console.error("Erro ao carregar ranking do Redis:", error);
      return res.status(500).json({ error: "Falha ao carregar ranking." });
    }
  }

  // Se o método não for nem GET nem POST
  return res.status(405).json({ error: "Método não permitido." });
}