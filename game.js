const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const homeScoreEl = document.querySelector("#homeScore");
const awayScoreEl = document.querySelector("#awayScore");
const clockEl = document.querySelector("#clock");
const actionButton = document.querySelector("#actionButton");
const restartButton = document.querySelector("#restartButton");

const state = {
  width: 960,
  height: 540,
  ground: 430,
  homeScore: 0,
  awayScore: 0,
  timeLeft: 60,
  gameOver: false,
  message: "Click corto: brazos y salto. Click largo y suelta: tirar.",
  messageTimer: 4,
  players: [],
  ball: null,
  lastTime: 0
};

const homeColor = "#4ec5ff";
const awayColor = "#ff6a4f";
const skinColor = "#f2b37a";
const ballColor = "#d9782d";
const longPressMs = 440;

let pressTimer = null;
let longPressFired = false;
let spaceTimer = null;
let spaceCharged = false;

function makePlayer(id, team, x, lane, controlled = false) {
  return {
    id,
    team,
    x,
    lane,
    baseX: x,
    baseY: 0,
    y: 0,
    vx: 0,
    vy: 0,
    jump: 0,
    jumpCount: 0,
    arm: 0,
    armCooldown: 0,
    controlled,
    hasBall: false,
    stealFlash: 0,
    facing: team === "home" ? 1 : -1,
    targetX: x
  };
}

function resetGame() {
  state.homeScore = 0;
  state.awayScore = 0;
  state.timeLeft = 60;
  state.gameOver = false;
  state.message = "Click corto: brazos y salto. Click largo y suelta: tirar.";
  state.messageTimer = 4;
  state.players = [
    makePlayer("Tu", "home", 220, 0, true),
    makePlayer("Azul", "home", 340, 1),
    makePlayer("Rojo", "away", 620, 0),
    makePlayer("Vino", "away", 740, 1)
  ];
  state.ball = {
    x: 220,
    y: state.ground - 58,
    vx: 0,
    vy: 0,
    owner: state.players[0],
    spin: 0,
    looseTimer: 0,
    scoredLock: 0,
    shotBy: null,
    shotByControlled: false
  };
  state.players[0].hasBall = true;
  syncHud();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.max(240, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.width = rect.width;
  state.height = rect.height;
  state.ground = rect.height - 82;
}

function syncHud() {
  homeScoreEl.textContent = state.homeScore;
  awayScoreEl.textContent = state.awayScore;
  clockEl.textContent = Math.ceil(state.timeLeft);
}

function tryJump(player) {
  const grounded = player.jump >= -1 && player.vy === 0;
  const maxJumps = player.controlled ? 2 : 1;
  if (!grounded && player.jumpCount >= maxJumps) return;

  player.vy = grounded ? -540 : -470;
  player.jumpCount = grounded ? 1 : player.jumpCount + 1;
}

function action(player = state.players[0], options = {}) {
  if (state.gameOver) return;

  const forceShot = options.forceShot === true;
  if (forceShot) {
    player.arm = 0.34;
    player.armCooldown = Math.max(player.armCooldown, 0.18);
    if (player.hasBall) {
      shoot(player, player.team === "home" ? rightHoop() : leftHoop());
    } else {
      state.message = "Necesitas tener la pelota para tirar.";
      state.messageTimer = 1.2;
    }
    return;
  }

  if (player.armCooldown > 0) return;
  player.arm = 0.34;
  player.armCooldown = 0.44;
  tryJump(player);

  if (player.hasBall) {
    const attackingHoop = player.team === "home" ? rightHoop() : leftHoop();
    const distance = Math.abs(player.x - attackingHoop.x);
    if (!player.controlled && distance < state.width * 0.34) {
      shoot(player, attackingHoop);
    }
  }
}

function leftHoop() {
  return { x: 58, y: state.ground - 222, team: "away" };
}

function rightHoop() {
  return { x: state.width - 58, y: state.ground - 222, team: "home" };
}

function shoot(player, hoop) {
  const ball = state.ball;
  player.hasBall = false;
  ball.owner = null;
  ball.looseTimer = 1.4;
  ball.x = player.x + player.facing * 22;
  ball.y = player.baseY + player.jump - 72;
  ball.shotBy = player.team;
  ball.shotByControlled = player.controlled;

  const dx = hoop.x - ball.x;
  const dy = hoop.y - 4 - ball.y;
  if (player.controlled) {
    const travelTime = Math.max(0.72, Math.min(1.15, Math.abs(dx) / 620));
    ball.vx = dx / travelTime;
    ball.vy = (dy - 0.5 * 980 * travelTime * travelTime) / travelTime;
  } else {
    ball.vx = dx * 1.35;
    ball.vy = dy * 2.1 - 500;
  }
  ball.scoredLock = 0.25;
  state.message = player.controlled ? "Tiro arriba..." : "El rival tira.";
  state.messageTimer = 1.4;
}

function steal(thief, victim) {
  if (!victim || !victim.hasBall || thief.team === victim.team) return;
  const hand = handPosition(thief);
  const ball = state.ball;
  const dx = hand.x - ball.x;
  const dy = hand.y - ball.y;
  if (Math.hypot(dx, dy) < 62 && thief.arm > 0) {
    victim.hasBall = false;
    thief.hasBall = true;
    ball.owner = thief;
    ball.vx = 0;
    ball.vy = 0;
    ball.shotBy = null;
    ball.shotByControlled = false;
    thief.stealFlash = 0.3;
    thief.facing = thief.team === "home" ? 1 : -1;
    state.message = thief.controlled ? "Robo limpio. Sigue saltando para tirar." : "Te robaron la pelota.";
    state.messageTimer = 1.7;
  }
}

function nearestOpponentWithBall(player) {
  return state.players.find((p) => p.team !== player.team && p.hasBall);
}

function update(dt) {
  if (!state.gameOver) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.gameOver = true;
      state.message =
        state.homeScore === state.awayScore
          ? "Empate. Reinicia para otra ronda."
          : state.homeScore > state.awayScore
            ? "Ganaste con puro timing."
            : "Perdiste por poco. Dale revancha.";
      state.messageTimer = 99;
    }
  }

  state.messageTimer = Math.max(0, state.messageTimer - dt);
  updatePlayers(dt);
  updateBall(dt);
  syncHud();
}

function updatePlayers(dt) {
  const ball = state.ball;
  const owner = ball.owner;

  for (const player of state.players) {
    player.baseY = state.ground - (player.lane === 0 ? 0 : 28);
    player.arm = Math.max(0, player.arm - dt);
    player.armCooldown = Math.max(0, player.armCooldown - dt);
    player.stealFlash = Math.max(0, player.stealFlash - dt);

    const attackDir = player.team === "home" ? 1 : -1;
    player.facing = owner && owner.team !== player.team ? (owner.x > player.x ? 1 : -1) : attackDir;

    if (player.controlled) {
      if (player.hasBall) {
        player.targetX = Math.min(state.width - 180, player.x + 140);
      } else if (owner && owner.team !== player.team) {
        player.targetX = owner.x - 42 * Math.sign(owner.x - player.x || 1);
      } else {
        player.targetX = ball.x - 40;
      }
    } else if (player.hasBall) {
      player.targetX = player.team === "home" ? state.width - 180 : 180;
      if (Math.abs(player.x - player.targetX) < 80 && Math.random() < dt * 1.6) action(player);
    } else if (owner && owner.team !== player.team) {
      const laneSpacing = 58 + player.lane * 76;
      player.targetX = owner.x - laneSpacing * Math.sign(owner.x - player.x || 1);
      if (Math.abs(player.x - owner.x) < 105 && Math.random() < dt * 1.9) action(player);
    } else {
      const homeSpot = player.team === "home" ? 310 + player.lane * 90 : state.width - 310 - player.lane * 90;
      player.targetX = owner ? homeSpot : ball.x + (player.team === "home" ? -50 : 50);
      if (!owner && Math.abs(player.x - ball.x) < 72 && Math.random() < dt * 1.3) action(player);
    }

    const accel = (player.targetX - player.x) * 7;
    player.vx += accel * dt;
    player.vx *= Math.pow(0.08, dt);
    player.x += player.vx * dt;
    player.x = Math.max(90, Math.min(state.width - 90, player.x));

    player.jump += player.vy * dt;
    player.vy += 1450 * dt;
    if (player.jump > 0) {
      player.jump = 0;
      player.vy = 0;
      player.jumpCount = 0;
    }
    player.y = player.baseY + player.jump;

    const victim = nearestOpponentWithBall(player);
    steal(player, victim);
  }
}

function updateBall(dt) {
  const ball = state.ball;
  ball.spin += dt * 9;
  ball.scoredLock = Math.max(0, ball.scoredLock - dt);

  if (ball.owner) {
    const owner = ball.owner;
    const hand = handPosition(owner);
    ball.x += (hand.x - ball.x) * Math.min(1, dt * 18);
    ball.y += (hand.y + 10 - ball.y) * Math.min(1, dt * 18);
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.vy += 980 * dt;
  ball.vx *= Math.pow(0.988, dt * 60);
  ball.vy *= Math.pow(0.996, dt * 60);

  const bounceY = state.ground - 18;
  if (ball.y > bounceY) {
    ball.y = bounceY;
    ball.vy = -Math.abs(ball.vy) * 0.58;
    ball.vx *= 0.88;
  }
  if (ball.x < 24 || ball.x > state.width - 24) {
    ball.x = Math.max(24, Math.min(state.width - 24, ball.x));
    ball.vx *= -0.52;
  }

  checkScore(rightHoop(), "home");
  checkScore(leftHoop(), "away");

  for (const player of state.players) {
    const hand = handPosition(player);
    const reach = player.arm > 0 ? 56 : 34;
    if (Math.hypot(hand.x - ball.x, hand.y - ball.y) < reach) {
      claimBall(player);
      break;
    }
  }
}

function claimBall(player) {
  state.players.forEach((p) => {
    p.hasBall = false;
  });
  player.hasBall = true;
  state.ball.owner = player;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.shotBy = null;
  state.ball.shotByControlled = false;
  state.message = player.controlled ? "Pelota recuperada." : "El rival agarro el rebote.";
  state.messageTimer = 1.4;
}

function checkScore(hoop, team) {
  const ball = state.ball;
  if (ball.scoredLock > 0) return;
  const rimY = hoop.y;
  const assist = ball.shotByControlled ? 18 : 0;
  const closeX = Math.abs(ball.x - hoop.x) < 28 + assist;
  const falling = ball.shotByControlled ? ball.vy > -120 : ball.vy > 0;
  const closeY = ball.y > rimY - 10 - assist * 0.4 && ball.y < rimY + 24 + assist;
  if (closeX && closeY && falling) {
    if (team === "home") state.homeScore += 2;
    else state.awayScore += 2;
    afterScore(team);
  }
}

function afterScore(team) {
  state.message = team === "home" ? "Canasta para ti." : "Canasta rival.";
  state.messageTimer = 2;
  const nextOwner = state.players.find((p) => p.team !== team && p.controlled) || state.players.find((p) => p.team !== team);
  state.players.forEach((p) => {
    p.hasBall = false;
    p.x = p.team === "home" ? 220 + p.lane * 120 : state.width - 220 - p.lane * 120;
    p.vx = 0;
    p.jump = 0;
    p.jumpCount = 0;
    p.vy = 0;
  });
  nextOwner.hasBall = true;
  state.ball.owner = nextOwner;
  state.ball.x = nextOwner.x;
  state.ball.y = nextOwner.baseY - 60;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.shotBy = null;
  state.ball.shotByControlled = false;
  state.ball.scoredLock = 0.8;
}

function handPosition(player) {
  const swing = player.arm > 0 ? Math.sin((player.arm / 0.34) * Math.PI) : 0;
  const side = player.facing || 1;
  return {
    x: player.x + side * (24 + swing * 12),
    y: player.baseY + player.jump - 62 - swing * 34
  };
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawCourt();
  drawHoop(leftHoop(), -1);
  drawHoop(rightHoop(), 1);

  const sorted = [...state.players].sort((a, b) => a.baseY - b.baseY);
  for (const player of sorted) drawPlayer(player);
  drawBall();
  drawMessage();
}

function drawCourt() {
  const w = state.width;
  const h = state.height;
  const g = state.ground;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#202126");
  sky.addColorStop(1, "#111215");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#b56d3b";
  ctx.fillRect(0, g - 20, w, h - g + 20);

  const floor = ctx.createLinearGradient(0, g - 20, 0, h);
  floor.addColorStop(0, "#d18a4b");
  floor.addColorStop(1, "#935329");
  ctx.fillStyle = floor;
  ctx.fillRect(0, g - 20, w, h - g + 20);

  ctx.strokeStyle = "rgba(255,255,255,0.58)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, g - 20);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(w / 2, g + 38, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeRect(42, g - 154, 190, h - g + 134);
  ctx.strokeRect(w - 232, g - 154, 190, h - g + 134);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let x = 0; x < w; x += 46) {
    ctx.fillRect(x, g + 24, 28, 2);
  }
}

function drawHoop(hoop, side) {
  ctx.save();
  ctx.translate(hoop.x, hoop.y);
  ctx.strokeStyle = "#f7f1e3";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(side * 30, -86);
  ctx.lineTo(side * 30, 16);
  ctx.stroke();

  ctx.fillStyle = "rgba(247,241,227,0.18)";
  ctx.fillRect(side > 0 ? 24 : -54, -84, 30, 54);

  ctx.strokeStyle = "#ff704f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 28, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(247,241,227,0.55)";
  ctx.lineWidth = 1.5;
  for (let i = -18; i <= 18; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i, 7);
    ctx.lineTo(i * 0.45, 42);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(player) {
  const x = player.x;
  const y = player.y;
  const color = player.team === "home" ? homeColor : awayColor;
  const accent = player.controlled ? "#f8c14b" : "#f7f1e3";
  const swing = player.arm > 0 ? Math.sin((player.arm / 0.34) * Math.PI) : 0;
  const side = player.facing || 1;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (player.controlled) {
    ctx.fillStyle = "rgba(248,193,75,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, player.baseY + 11, 42, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (player.stealFlash > 0) {
    ctx.strokeStyle = "rgba(248,193,75,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 54, 48 + player.stealFlash * 40, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "#242328";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 14);
  ctx.lineTo(x - 18, y + 16);
  ctx.moveTo(x + 10, y - 14);
  ctx.lineTo(x + 16, y + 16);
  ctx.stroke();

  ctx.fillStyle = color;
  roundedRect(x - 17, y - 70, 34, 47, 8);
  ctx.fillStyle = accent;
  ctx.fillRect(x - 14, y - 50, 28, 5);

  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(x, y - 86, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#211c1b";
  ctx.beginPath();
  ctx.arc(x + side * 4, y - 89, 2, 0, Math.PI * 2);
  ctx.fill();

  const shoulderY = y - 62;
  const leftHand = { x: x - 26 - swing * 8, y: shoulderY - 8 - swing * 26 };
  const rightHand = { x: x + 26 + swing * 12 * side, y: shoulderY - 5 - swing * 34 };

  ctx.strokeStyle = skinColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x - 13, shoulderY);
  ctx.lineTo(leftHand.x, leftHand.y);
  ctx.moveTo(x + 13, shoulderY);
  ctx.lineTo(rightHand.x, rightHand.y);
  ctx.stroke();

  if (player.controlled) {
    ctx.fillStyle = "#f7f1e3";
    ctx.font = "700 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.id, x, y - 109);
  }

  ctx.restore();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawBall() {
  const ball = state.ball;
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin);
  ctx.fillStyle = ballColor;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b321c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.moveTo(-15, 0);
  ctx.lineTo(15, 0);
  ctx.moveTo(0, -15);
  ctx.lineTo(0, 15);
  ctx.ellipse(0, 0, 6, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMessage() {
  if (state.messageTimer <= 0) return;
  const isSmall = state.width < 540;
  const boxWidth = Math.min(isSmall ? 310 : 520, state.width - 28);
  const boxHeight = isSmall ? 58 : 44;
  const x = state.width / 2 - boxWidth / 2;
  ctx.save();
  ctx.fillStyle = "rgba(17,17,19,0.74)";
  roundedRect(x, 18, boxWidth, boxHeight, 8);
  ctx.fillStyle = "#f8f4e8";
  ctx.font = `800 ${isSmall ? 12 : 16}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isSmall && state.message.includes(". ")) {
    const lines = state.message.split(". ");
    ctx.fillText(`${lines[0]}.`, state.width / 2, 36);
    ctx.fillText(lines.slice(1).join(". "), state.width / 2, 58);
  } else {
    ctx.fillText(state.message, state.width / 2, 40);
  }
  ctx.restore();
}

function frame(time) {
  if (!state.lastTime) state.lastTime = time;
  const dt = Math.min(0.033, (time - state.lastTime) / 1000);
  state.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function startPress(event) {
  event.preventDefault();
  clearTimeout(pressTimer);
  longPressFired = false;
  action();
  pressTimer = setTimeout(() => {
    longPressFired = true;
    state.message = "Suelta para tirar.";
    state.messageTimer = 0.8;
  }, longPressMs);
}

function endPress(event) {
  if (event) event.preventDefault();
  clearTimeout(pressTimer);
  pressTimer = null;
  if (longPressFired) {
    action(state.players[0], { forceShot: true });
  }
  longPressFired = false;
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    if (event.repeat) return;
    action();
    if (event.code === "Space") {
      clearTimeout(spaceTimer);
      spaceCharged = false;
      spaceTimer = setTimeout(() => {
        spaceCharged = true;
        state.message = "Suelta ESPACIO para tirar.";
        state.messageTimer = 0.8;
      }, longPressMs);
    }
  }
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    clearTimeout(spaceTimer);
    spaceTimer = null;
    if (spaceCharged) {
      action(state.players[0], { forceShot: true });
    }
    spaceCharged = false;
  }
});
canvas.addEventListener("pointerdown", startPress);
canvas.addEventListener("pointerup", endPress);
canvas.addEventListener("pointercancel", endPress);
canvas.addEventListener("pointerleave", endPress);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
actionButton.addEventListener("pointerdown", startPress);
actionButton.addEventListener("pointerup", endPress);
actionButton.addEventListener("pointercancel", endPress);
actionButton.addEventListener("pointerleave", endPress);
actionButton.addEventListener("click", (event) => {
  if (event.detail === 0 && !longPressFired) action();
});
restartButton.addEventListener("click", resetGame);

resizeCanvas();
resetGame();
requestAnimationFrame(frame);
