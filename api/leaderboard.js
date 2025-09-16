// api/leaderboard.js
import admin from 'firebase-admin';

// --- CONFIGURAÇÃO DA CONEXÃO SEGURA COM O FIREBASE ---

// Pega a chave secreta que salvamos na Vercel
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

// Se a chave não estiver configurada, a API não funciona
if (!serviceAccountBase64) {
  throw new Error("A variável de ambiente FIREBASE_SERVICE_ACCOUNT_BASE64 não está definida.");
}

// Decodifica a chave de Base64 para o formato JSON original
const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
const serviceAccount = JSON.parse(serviceAccountJson);

// Inicializa a conexão com o Firebase, mas só se já não houver uma conexão ativa
// Isso é uma otimização importante para ambientes serverless como a Vercel
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Pega uma referência ao banco de dados Firestore
const db = admin.firestore();

// --- FUNÇÃO PRINCIPAL DA API ---

export default async function handler(req, res) {

  // ROTA POST: Para salvar uma nova pontuação
  if (req.method === 'POST') {
    try {
      const { name, score, difficulty } = req.body;

      if (!name || typeof score !== 'number' || !difficulty) {
        return res.status(400).json({ error: 'Dados inválidos ou faltando.' });
      }
      
      // Cria um objeto com os dados do jogador
      const newEntry = {
        name: name,
        score: score,
        difficulty: difficulty,
        createdAt: new Date(), // Adiciona um carimbo de data/hora
      };

      // Adiciona o novo registro à coleção do Firestore. 
      // O Firestore cria a coleção se ela não existir.
      // Usamos `difficulty` no nome da coleção para separar os rankings.
      const collectionRef = db.collection(`leaderboard-${difficulty}`);
      await collectionRef.add(newEntry);

      return res.status(201).json({ success: true, data: newEntry });

    } catch (error) {
      console.error('Erro ao salvar no Firestore:', error);
      return res.status(500).json({ error: 'Falha ao salvar pontuação.' });
    }
  }

  // ROTA GET: Para buscar o ranking
  if (req.method === 'GET') {
    try {
      const { difficulty } = req.query;

      if (!difficulty) {
        return res.status(400).json({ error: "Parâmetro 'difficulty' é obrigatório." });
      }

      const collectionRef = db.collection(`leaderboard-${difficulty}`);
      
      // Cria uma query para buscar os dados:
      // 1. Ordena por 'score' em ordem decrescente (maior primeiro)
      // 2. Limita aos 10 primeiros resultados
      const snapshot = await collectionRef.orderBy('score', 'desc').limit(10).get();

      if (snapshot.empty) {
        return res.status(200).json([]); // Retorna lista vazia se não houver scores
      }

      // Mapeia os documentos retornados para um formato de lista simples
      const leaderboard = snapshot.docs.map(doc => doc.data());

      return res.status(200).json(leaderboard);

    } catch (error) {
      console.error('Erro ao carregar do Firestore:', error);
      return res.status(500).json({ error: 'Falha ao carregar ranking.' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}