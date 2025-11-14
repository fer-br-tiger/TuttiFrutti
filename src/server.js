import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('src/public'));

let gameState = {
  players: [],
  host: null,
  columns: ['Nombre', 'Apellido', 'País', 'Color', 'Fruta', 'Animal'],
  currentLetter: '',
  isPlaying: false,
  isSelectingLetter: false,
  isValidating: false,
  answers: {},
  votes: {}, // { playerId: { columnIndex: { voterId: true/false } } }
  round: 1,
  maxRounds: 10,
  roundScores: []
};

let letterInterval = null;
let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function calculateScores() {
  const scores = {};
  const answerCounts = {};
  const validAnswers = {}; // Respuestas que pasaron la validación

  gameState.players.forEach(player => {
    scores[player.id] = 0;
    validAnswers[player.id] = [];
  });

  // Validar respuestas según votos
  Object.keys(gameState.answers).forEach(playerId => {
    gameState.answers[playerId].forEach((answer, colIndex) => {
      if (answer && answer.trim() !== '') {
        const votes = gameState.votes[playerId]?.[colIndex] || {};
        const voteCount = Object.keys(votes).length;
        const acceptVotes = Object.values(votes).filter(v => v === true).length;
        
        // Una respuesta es válida si tiene mayoría de votos a favor
        // Si no hay votos (solo 1 jugador), se acepta automáticamente
        const isValid = voteCount === 0 || acceptVotes > voteCount / 2;
        
        validAnswers[playerId][colIndex] = isValid;
      } else {
        validAnswers[playerId][colIndex] = false;
      }
    });
  });

  // Contar respuestas válidas por columna
  gameState.columns.forEach((col, colIndex) => {
    answerCounts[colIndex] = {};
    
    Object.keys(gameState.answers).forEach(playerId => {
      const answer = gameState.answers[playerId][colIndex];
      if (answer && answer.trim() !== '' && validAnswers[playerId][colIndex]) {
        const normalizedAnswer = answer.toLowerCase().trim();
        answerCounts[colIndex][normalizedAnswer] = (answerCounts[colIndex][normalizedAnswer] || 0) + 1;
      }
    });
  });

  // Calcular puntos
  Object.keys(gameState.answers).forEach(playerId => {
    gameState.answers[playerId].forEach((answer, colIndex) => {
      if (answer && answer.trim() !== '' && validAnswers[playerId][colIndex]) {
        const normalizedAnswer = answer.toLowerCase().trim();
        const count = answerCounts[colIndex][normalizedAnswer];
        
        // Contar cuántos jugadores respondieron algo válido en esta columna
        const totalValidAnswersInColumn = Object.keys(validAnswers).filter(pid => 
          validAnswers[pid][colIndex] === true
        ).length;
        
        if (count === 1 && totalValidAnswersInColumn === 1) {
          // Solo un jugador respondió válido en esta columna
          scores[playerId] += 20;
        } else if (count === 1) {
          // Respuesta única pero otros también respondieron
          scores[playerId] += 10;
        } else {
          // Respuesta repetida
          scores[playerId] += 5;
        }
      }
    });
  });

  return { scores, validAnswers };
}

function stopLetterSelection() {
  if (letterInterval) {
    clearInterval(letterInterval);
    letterInterval = null;
  }
}

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('join', (data) => {
    const player = {
      id: socket.id,
      name: data.name,
      score: 0
    };

    gameState.players.push(player);

    if (!gameState.host) {
      gameState.host = socket.id;
      socket.emit('host', { isHost: true });
    }

    gameState.answers[socket.id] = new Array(gameState.columns.length).fill('');

    socket.emit('joined', {
      playerId: socket.id,
      gameState: gameState
    });

    io.emit('playerJoined', {
      player: player,
      players: gameState.players
    });
  });

  socket.on('setColumns', (data) => {
    if (socket.id === gameState.host && !gameState.isPlaying) {
      gameState.columns = data.columns;
      
      Object.keys(gameState.answers).forEach(pid => {
        gameState.answers[pid] = new Array(gameState.columns.length).fill('');
      });

      io.emit('columnsUpdated', {
        columns: gameState.columns
      });
    }
  });

  socket.on('startRound', () => {
    if (socket.id === gameState.host && !gameState.isSelectingLetter) {
      gameState.isSelectingLetter = true;
      gameState.currentLetter = '';
      gameState.votes = {}; // Limpiar votos

      Object.keys(gameState.answers).forEach(pid => {
        gameState.answers[pid] = new Array(gameState.columns.length).fill('');
      });

      io.emit('letterSelectionStarted', {
        round: gameState.round
      });

      let currentIndex = 0;

      letterInterval = setInterval(() => {
        gameState.currentLetter = letters[currentIndex];
        io.emit('letterChanged', { letter: gameState.currentLetter });
        
        currentIndex = (currentIndex + 1) % letters.length;
      }, 300);
    }
  });

  socket.on('basta', () => {
    if (gameState.isSelectingLetter) {
      stopLetterSelection();
      gameState.isSelectingLetter = false;
      gameState.isPlaying = true;

      io.emit('letterSelected', {
        letter: gameState.currentLetter
      });
    }
  });

  socket.on('updateAnswer', (data) => {
    if (gameState.isPlaying && gameState.answers[socket.id]) {
      gameState.answers[socket.id][data.columnIndex] = data.answer;

      io.emit('answerUpdated', {
        playerId: socket.id,
        columnIndex: data.columnIndex,
        answer: data.answer
      });
    }
  });

  socket.on('stop', () => {
    if (gameState.isPlaying) {
      letters = letters.replace(gameState.currentLetter, '');
      gameState.isPlaying = false;
      gameState.isValidating = true;

      // Inicializar estructura de votos
      gameState.players.forEach(player => {
        gameState.votes[player.id] = {};
        gameState.columns.forEach((col, idx) => {
          gameState.votes[player.id][idx] = {};
        });
      });

      io.emit('validationStarted', {
        answers: gameState.answers,
        players: gameState.players,
        columns: gameState.columns
      });
    }
  });

  socket.on('submitVote', (data) => {
    if (gameState.isValidating && socket.id !== data.playerId) {
      // Un jugador no puede votar sus propias respuestas
      if (!gameState.votes[data.playerId]) {
        gameState.votes[data.playerId] = {};
      }
      if (!gameState.votes[data.playerId][data.columnIndex]) {
        gameState.votes[data.playerId][data.columnIndex] = {};
      }
      
      gameState.votes[data.playerId][data.columnIndex][socket.id] = data.isValid;

      // Verificar si todos han votado
      let allVoted = true;
      for (let playerId of Object.keys(gameState.answers)) {
        for (let colIndex = 0; colIndex < gameState.columns.length; colIndex++) {
          const answer = gameState.answers[playerId][colIndex];
          if (answer && answer.trim() !== '') {
            // Contar cuántos jugadores (excepto el autor) deben votar
            const totalVoters = gameState.players.length - 1;
            const currentVotes = Object.keys(gameState.votes[playerId]?.[colIndex] || {}).length;
            
            if (currentVotes < totalVoters) {
              allVoted = false;
              break;
            }
          }
        }
        if (!allVoted) break;
      }

      if (allVoted) {
        finishRound();
      }
    }
  });

  socket.on('resetGame', () => {
    if (socket.id === gameState.host) {
      gameState.players.forEach(player => {
        player.score = 0;
      });

      gameState.round = 1;
      gameState.roundScores = [];
      gameState.isPlaying = false;
      gameState.isSelectingLetter = false;
      gameState.isValidating = false;
      gameState.votes = {};
      stopLetterSelection();

      Object.keys(gameState.answers).forEach(pid => {
        gameState.answers[pid] = new Array(gameState.columns.length).fill('');
      });

      io.emit('gameReset', {
        players: gameState.players
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    delete gameState.answers[socket.id];
    delete gameState.votes[socket.id];

    if (gameState.players.length > 0) {
        if (socket.id === gameState.host) {
            gameState.host = gameState.players[0].id;
      
            if (gameState.isSelectingLetter) {
                stopLetterSelection();
                gameState.isSelectingLetter = false;
            }
      
            io.emit('newHost', { hostId: gameState.host });
        }
    } else {
        // Reiniciar el estado del juego si no quedan jugadores
        gameState = {
            players: [],
            host: null,
            columns: ['Nombre', 'Apellido', 'País', 'Color', 'Fruta', 'Animal'],
            currentLetter: '',
            isPlaying: false,
            isSelectingLetter: false,
            isValidating: false,
            answers: {},
            votes: {},
            round: 1,
            maxRounds: 10,
            roundScores: []
        };
        letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    io.emit('playerLeft', {
      playerId: socket.id,
      players: gameState.players
    });
  });
});

function finishRound() {
  gameState.isValidating = false;
  const { scores, validAnswers } = calculateScores();

  const roundScore = {
    round: gameState.round,
    scores: {},
    answers: JSON.parse(JSON.stringify(gameState.answers)),
    validAnswers: validAnswers
  };

  gameState.players.forEach(player => {
    player.score += scores[player.id] || 0;
    roundScore.scores[player.id] = scores[player.id] || 0;
  });

  gameState.roundScores.push(roundScore);

  const isGameOver = gameState.round >= gameState.maxRounds;

  io.emit('roundEnded', {
    scores: scores,
    totalScores: gameState.players,
    answers: gameState.answers,
    validAnswers: validAnswers,
    isGameOver: isGameOver,
    currentRound: gameState.round,
    maxRounds: gameState.maxRounds
  });

  if (isGameOver) {
    io.emit('gameOver', {
      finalScores: gameState.players,
      roundScores: gameState.roundScores
    });
  }

  gameState.round++;
}

server.listen(PORT, () => {
  console.log(`🎮 Servidor TuttiFrutti corriendo en http://localhost:${PORT}`);
  console.log('📡 Los jugadores pueden conectarse desde la red local usando tu IP');
});
