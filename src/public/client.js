let socket;
let myPlayerId;
let isHost = false;
let gameState = {
    players: [],
    host: null,
    columns: [],
    currentLetter: '',
    isPlaying: false,
    round: 1,
    maxRounds: 10
};
let votedAnswers = new Set(); // Para rastrear qué respuestas ya voté

function updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (connected) {
        status.textContent = 'Conectado ✓';
        status.className = 'connection-status connected';
    } else {
        status.textContent = 'Desconectado ✗';
        status.className = 'connection-status disconnected';
    }
}

function joinGame() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        alert('Por favor ingresa tu nombre');
        return;
    }

    socket = io();

    socket.on('connect', () => {
        console.log('Conectado al servidor');
        updateConnectionStatus(true);
        socket.emit('join', { name: name });
    });

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor');
        updateConnectionStatus(false);
    });

    socket.on('host', (data) => {
        isHost = true;
        document.getElementById('columnConfig').style.display = 'block';
        initializeColumnInputs(6);
    });

    socket.on('joined', (data) => {
        myPlayerId = data.playerId;
        gameState = data.gameState;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        updatePlayersList();
        updateTable();
        updateRoundIndicator();
    });

    socket.on('playerJoined', (data) => {
        gameState.players = data.players;
        updatePlayersList();
    });

    socket.on('playerLeft', (data) => {
        gameState.players = data.players;
        updatePlayersList();
    });

    socket.on('columnsUpdated', (data) => {
        if (isHost) {
            document.getElementById('hostControls').style.display = 'block';
        }
        gameState.columns = data.columns;
        updateTable();
    });

    socket.on('letterSelectionStarted', (data) => {
        gameState.round = data.round;
        updateRoundIndicator();
        document.getElementById('roundIndicator').style.display = 'block';
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('resultsContainer').style.display = 'none';
        document.getElementById('finalResults').style.display = 'none';
        document.getElementById('validationContainer').style.display = 'none';
        document.getElementById('letterSelection').style.display = 'block';

        if (isHost) {
            document.getElementById('bastaBtn').style.display = 'none';
        } else {
            document.getElementById('bastaBtn').style.display = 'block';
        }
    });

    socket.on('letterChanged', (data) => {
        if (isHost || data.letter === 'A') {
            document.getElementById('letterDisplaySelecting').textContent = data.letter;
        } else {
            document.getElementById('letterDisplaySelecting').textContent = '*';
        }
    });

    socket.on('letterSelected', (data) => {
        gameState.currentLetter = data.letter;
        gameState.isPlaying = true;

        document.getElementById('letterSelection').style.display = 'none';
        document.getElementById('letterDisplay').textContent = data.letter;
        document.getElementById('letterDisplay').style.display = 'block';
        document.getElementById('gameTableContainer').style.display = 'block';

        enableInputs();
        updateTable();
    });

    socket.on('answerUpdated', (data) => {
        updateCellFromOtherPlayer(data.playerId, data.columnIndex, data.answer);
    });

    socket.on('validationStarted', (data) => {
        votedAnswers.clear();
        document.getElementById('gameTableContainer').style.display = 'none';
        showValidation(data.answers, data.players, data.columns);
    });

    socket.on('roundEnded', (data) => {
        gameState.isPlaying = false;
        disableInputs();
        document.getElementById('validationContainer').style.display = 'none';
        showResults(data.scores, data.totalScores, data.answers, data.validAnswers, data.isGameOver);
        gameState.players = data.totalScores;
        updatePlayersList();
    });

    socket.on('gameOver', (data) => {
        showFinalResults(data.finalScores, data.roundScores);
    });

    socket.on('gameReset', (data) => {
        gameState.players = data.players;
        gameState.round = 1;
        updatePlayersList();
        updateRoundIndicator();

        document.getElementById('finalResults').style.display = 'none';
        document.getElementById('resultsContainer').style.display = 'none';
        document.getElementById('letterDisplay').style.display = 'none';
        document.getElementById('gameTableContainer').style.display = 'none';
        document.getElementById('roundIndicator').style.display = 'none';
        document.getElementById('validationContainer').style.display = 'none';

        if (isHost) {
            document.getElementById('hostControls').style.display = 'block';
        }
    });

    socket.on('newHost', (data) => {
        if (myPlayerId === data.hostId) {
            isHost = true;
            gameState.host = myPlayerId;
            document.getElementById('hostControls').style.display = 'block';
            document.getElementById('resetGameBtn').style.display = 'block';
        }
    });
}

function updateRoundIndicator() {
    document.getElementById('currentRound').textContent = gameState.round;
    document.getElementById('maxRounds').textContent = gameState.maxRounds;
}

function initializeColumnInputs(count) {
    const container = document.getElementById('columnInputs');
    const defaultColumns = ['Nombre', 'Apellido', 'País', 'Color', 'Fruta', 'Animal'];
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control mb-2';
        input.placeholder = `Columna ${i + 1}`;
        input.value = defaultColumns[i] || '';
        input.maxLength = 20;
        container.appendChild(input);
    }

    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group mt-2';
    btnGroup.innerHTML = `
                <button class="btn btn-sm btn-outline-primary" onclick="addColumn()">+ Agregar</button>
                <button class="btn btn-sm btn-outline-danger" onclick="removeColumn()">- Quitar</button>
            `;
    container.appendChild(btnGroup);
}

function addColumn() {
    const container = document.getElementById('columnInputs');
    const inputs = container.querySelectorAll('input[type="text"]');
    if (inputs.length < 10) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control mb-2';
        input.placeholder = `Columna ${inputs.length + 1}`;
        input.maxLength = 20;
        container.insertBefore(input, container.lastChild);
    } else {
        alert('Máximo 10 columnas');
    }
}

function removeColumn() {
    const container = document.getElementById('columnInputs');
    const inputs = container.querySelectorAll('input[type="text"]');
    if (inputs.length > 1) {
        inputs[inputs.length - 1].remove();
    }
}

function saveColumns() {
    const inputs = document.querySelectorAll('#columnInputs input[type="text"]');
    const columns = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(col => col !== '');

    if (columns.length === 0) {
        alert('Debes configurar al menos una columna');
        return;
    }

    socket.emit('setColumns', { columns: columns });
    document.getElementById('columnConfig').style.display = 'none';
}

function updatePlayersList() {
    const list = document.getElementById('playersList');
    list.innerHTML = gameState.players.map(player => `
                <div class="player-item">
                    <span>
                        ${player.name} 
                        ${player.id === gameState.host ? '<span class="host-badge">HOST</span>' : ''}
                    </span>
                    <span class="score-badge">${player.score} pts</span>
                </div>
            `).join('');
}

function updateTable() {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');

    header.innerHTML = gameState.columns.map(col => `<th>${col}</th>`).join('');

    body.innerHTML = `
                    <tr>
                        ${gameState.columns.map((col, idx) => `
                            <td>
                                <input 
                                    type="text" 
                                    class="form-control form-control-sm" 
                                    data-col="${idx}"
                                    oninput="updateAnswer(this)"
                                    maxlength="30"
                                >
                            </td>
                        `).join('')}
                    </tr>
                    `;
}

function updateAnswer(input) {
    const colIndex = parseInt(input.dataset.col);
    socket.emit('updateAnswer', {
        columnIndex: colIndex,
        answer: input.value
    });
}

function updateCellFromOtherPlayer(playerId, colIndex, answer) {
    const input = document.querySelector(`input[data-player="${playerId}"][data-col="${colIndex}"]`);
    if (input) {
        input.value = answer;
    }
}

function enableInputs() {
    document.querySelectorAll(`input[data-player="${myPlayerId}"]`).forEach(input => {
        input.disabled = false;
        input.value = '';
    });
    document.getElementById('stopBtn').disabled = false;
}

function disableInputs() {
    document.querySelectorAll('input[type="text"]').forEach(input => {
        input.disabled = true;
    });
    document.getElementById('stopBtn').disabled = true;
}

function startRound() {
    socket.emit('startRound');
}

function callBasta() {
    socket.emit('basta');
}

function callStop() {
    socket.emit('stop');
}

function showValidation(answers, players, columns) {
    const container = document.getElementById('validationContainer');
    const list = document.getElementById('validationList');
    container.style.display = 'block';
    list.innerHTML = '';

    players.forEach(player => {
        if (player.id === myPlayerId) return; // No votar mis propias respuestas

        columns.forEach((col, colIndex) => {
            const answer = answers[player.id][colIndex];
            if (answer && answer.trim() !== '') {
                const voteKey = `${player.id}-${colIndex}`;

                const item = document.createElement('div');
                item.className = 'validation-item';
                item.innerHTML = `
                            <div class="validation-word">"${answer}"</div>
                            <div class="text-muted mb-2">${player.name} - ${col}</div>
                            <div class="vote-buttons">
                                <button class="btn btn-success vote-btn" onclick="vote('${player.id}', ${colIndex}, true, this)">
                                    ✓ Válida
                                </button>
                                <button class="btn btn-danger vote-btn" onclick="vote('${player.id}', ${colIndex}, false, this)">
                                    ✗ Inválida
                                </button>
                            </div>
                        `;
                list.appendChild(item);
            }
        });
    });

    if (list.children.length === 0) {
        list.innerHTML = '<div class="alert alert-info">No hay respuestas para validar</div>';
    }
}

function vote(playerId, columnIndex, isValid, button) {
    const voteKey = `${playerId}-${columnIndex}`;

    if (votedAnswers.has(voteKey)) {
        return; // Ya voté esta respuesta
    }

    votedAnswers.add(voteKey);
    socket.emit('submitVote', { playerId, columnIndex, isValid });

    // Deshabilitar botones de esta respuesta
    const buttons = button.parentElement.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);

    // Marcar el botón seleccionado
    button.classList.add('active');
}

function showResults(roundScores, totalScores, answers, validAnswers, isGameOver) {
    const container = document.getElementById('resultsContainer');
    container.style.display = 'block';

    let html = '<table class="table table-striped"><thead><tr><th>Jugador</th>';
    gameState.columns.forEach(col => html += `<th>${col}</th>`);
    html += '<th>Puntos Ronda</th></tr></thead><tbody>';

    gameState.players.forEach(player => {
        html += `<tr><td><strong>${player.name}</strong></td>`;
        answers[player.id].forEach((answer, idx) => {
            const isValid = validAnswers[player.id][idx];
            const cellClass = answer && answer.trim() !== '' ? (isValid ? 'answer-valid' : 'answer-invalid') : '';
            html += `<td class="${cellClass}">${answer || '-'}</td>`;
        });
        html += `<td class="table-success"><strong>+${roundScores[player.id]} pts</strong></td></tr>`;
    });

    html += '</tbody></table>';
    html += '<div class="alert alert-info mt-3">';
    html += '<strong>Puntaje:</strong> Único (solo tú) = 20 pts | Único (otros también escribieron) = 10 pts | Repetida = 5 pts<br>';
    html += '<strong>Validación:</strong> ✅ Verde = Válida | ❌ Roja tachada = Inválida';
    html += '</div>';

    document.getElementById('resultsTable').innerHTML = html;

    if (isGameOver) {
        document.getElementById('nextRoundBtn').style.display = 'none';
    } else {
        document.getElementById('nextRoundBtn').style.display = 'block';
    }
}

function showFinalResults(finalScores, roundScores) {
    document.getElementById('finalResults').style.display = 'block';
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('gameTableContainer').style.display = 'none';
    document.getElementById('letterDisplay').style.display = 'none';

    const sortedPlayers = [...finalScores].sort((a, b) => b.score - a.score);

    const podium = document.getElementById('podiumContainer');
    podium.innerHTML = '';

    if (sortedPlayers.length >= 1) {
        podium.innerHTML += `
                    <div class="podium-place podium-1">
                        <h3>🥇</h3>
                        <div><strong>${sortedPlayers[0].name}</strong></div>
                        <div style="font-size: 1.5rem; font-weight: bold;">${sortedPlayers[0].score} pts</div>
                    </div>
                `;
    }

    if (sortedPlayers.length >= 2) {
        podium.innerHTML = `
                    <div class="podium-place podium-2">
                        <h3>🥈</h3>
                        <div><strong>${sortedPlayers[1].name}</strong></div>
                        <div style="font-size: 1.3rem; font-weight: bold;">${sortedPlayers[1].score} pts</div>
                    </div>
                ` + podium.innerHTML;
    }

    if (sortedPlayers.length >= 3) {
        podium.innerHTML += `
                    <div class="podium-place podium-3">
                        <h3>🥉</h3>
                        <div><strong>${sortedPlayers[2].name}</strong></div>
                        <div style="font-size: 1.1rem; font-weight: bold;">${sortedPlayers[2].score} pts</div>
                    </div>
                `;
    }

    let html = '<div style="background: white; padding: 20px; border-radius: 10px; color: #333;">';
    html += '<h4 class="text-center mb-3">Clasificación Final</h4>';
    html += '<table class="table table-bordered"><thead><tr><th>Posición</th><th>Jugador</th><th>Puntaje Total</th></tr></thead><tbody>';

    sortedPlayers.forEach((player, index) => {
        html += `<tr><td><strong>#${index + 1}</strong></td><td>${player.name}</td><td><strong>${player.score} pts</strong></td></tr>`;
    });

    html += '</tbody></table></div>';
    document.getElementById('finalScoresTable').innerHTML = html;

    if (isHost) {
        document.getElementById('resetGameBtn').style.display = 'block';
    }
}

function prepareNextRound() {
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('letterDisplay').style.display = 'none';
    document.getElementById('gameTableContainer').style.display = 'none';

    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
    }
}

function resetGame() {
    socket.emit('resetGame');
}

document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('playerName');
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinGame();
            }
        });
    }
});