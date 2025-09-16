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

      // LÓGICA ANTIGA: Se uma dificuldade específica for pedida, retorna o ranking dela.
      // Isso mantém a funcionalidade anterior, caso você precise dela no futuro.
      if (difficulty) {
        const collectionRef = db.collection(`leaderboard-${difficulty}`);
        const snapshot = await collectionRef.orderBy('score', 'desc').limit(10).get();
        const leaderboard = snapshot.docs.map(doc => doc.data());
        return res.status(200).json(leaderboard);
      }

      // --- NOVA LÓGICA PARA O RANKING UNIFICADO ---

      // 1. Define as coleções que vamos consultar.
      const difficulties = ['easy', 'medium', 'hard'];

      // 2. Cria uma lista de "promessas" de busca no banco de dados.
      //    Cada promessa vai buscar o TOP 10 de uma dificuldade.
      const queryPromises = difficulties.map(diff =>
        db.collection(`leaderboard-${diff}`).orderBy('score', 'desc').limit(10).get()
      );

      // 3. Executa todas as buscas em paralelo para ganhar tempo.
      const snapshots = await Promise.all(queryPromises);

      // 4. Junta todos os resultados em uma única lista.
      let allScores = [];
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          allScores.push(doc.data());
        });
      });

      // 5. Ordena a lista unificada pela maior pontuação (score).
      allScores.sort((a, b) => b.score - a.score);

      // 6. Pega apenas os 10 melhores do ranking geral.
      const top10Overall = allScores.slice(0, 10);

      return res.status(200).json(top10Overall);

    } catch (error) {
      console.error('Erro ao carregar do Firestore:', error);
      return res.status(500).json({ error: 'Falha ao carregar ranking.' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}