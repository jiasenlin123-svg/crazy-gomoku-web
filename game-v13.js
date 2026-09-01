(function(){
  const SIZE=15,EMPTY=0,BLACK=1,WHITE=2;
  const DECISION_LOCK_MS=1600,AI_THINK_MS=1550;
  const LIGHT='light',MEDIUM='medium',HEAVY='heavy';
  const BAD='bad',GOOD='good',CHAOTIC='chaotic';

  const EVENTS=[
    {id:'blocked',tier:LIGHT,bias:BAD,icon:'🚧',title:'禁止施工',lead:'这格突然被封了。',next:'这一步不能下，必须换个位置。'},
    {id:'drift',tier:LIGHT,bias:BAD,icon:'🌪️',title:'手滑了',lead:'棋子直接滑出控制。',next:'棋子会在原落点周围最多偏移 3 格。'},
    {id:'drop',tier:LIGHT,bias:BAD,icon:'💣',title:'没拿稳',lead:'这颗棋直接掉没了。',next:'本次落子作废，直接轮到对手。'},
    {id:'bonus',tier:LIGHT,bias:GOOD,icon:'⚡',title:'状态爆棚',lead:'突然来感觉了。',next:'这颗落下后，还能再下一颗。'},
    {id:'wild',tier:MEDIUM,bias:BAD,icon:'🎰',title:'失控落子',lead:'你选的位置不算数了。',next:'系统会从整张棋盘随机挑一个空位落子。'},
    {id:'teleport',tier:MEDIUM,bias:BAD,icon:'🌀',title:'传送门',lead:'落点被空间扭曲。',next:'棋子会优先传送到离原落点很远的位置。'},
    {id:'blackhole',tier:MEDIUM,bias:BAD,icon:'🕳️',title:'黑洞出现',lead:'触发者自己的棋更容易被吞。',next:'正常落子后，优先吞掉一颗触发者已有的棋。'},
    {id:'swap',tier:MEDIUM,bias:CHAOTIC,icon:'🔀',title:'强制换位',lead:'两颗棋突然互换位置。',next:'正常落子后，随机一黑一白交换位置。'},
    {id:'reinforce',tier:MEDIUM,bias:GOOD,icon:'🚀',title:'援军到了',lead:'这次意外居然是好事。',next:'正常落子后，附近再补一颗同色棋。'},
    {id:'confiscate',tier:HEAVY,bias:BAD,icon:'🧹',title:'系统没收',lead:'刚铺好的阵型要少一块。',next:'正常落子后，随机没收一颗触发者已有棋子。'},
    {id:'explode',tier:HEAVY,bias:CHAOTIC,icon:'💥',title:'棋盘爆炸',lead:'这块区域要炸了。',next:'正常落子后，附近最多四颗棋会被炸掉。'},
    {id:'flip',tier:HEAVY,bias:BAD,icon:'🔴',title:'阵营反转',lead:'这颗棋突然叛变。',next:'你刚下的这颗棋会直接变成对手颜色。'},
    {id:'storm',tier:HEAVY,bias:CHAOTIC,icon:'🌪️',title:'超级风暴',lead:'棋盘彻底乱套。',next:'正常落子后，随机四颗棋会被吹到远处。'},
    {id:'double',tier:HEAVY,bias:GOOD,icon:'👯',title:'双倍暴走',lead:'一次下两颗，谁也拦不住。',next:'正常落子后，再随机补一颗同色棋。'},
    {id:'opponentRush',tier:HEAVY,bias:BAD,icon:'👹',title:'对手插队',lead:'你的回合被硬塞进一手对方棋。',next:'正常落子后，对手会立刻额外获得一步。'}
  ];

  const ITEMS={
    spray:{icon:'🧯',name:'降温喷雾',reduce:15,minChaos:25},
    ice:{icon:'🧊',name:'冰镇汽水',reduce:25,minChaos:45},
    lucky:{icon:'🍀',name:'幸运护符',reduce:10,minChaos:20}
  };

  const state={
    board:emptyBoard(),current:BLACK,gameOver:false,playerRescues:3,
    pending:null,overlayActive:false,aiThinking:false,extraTurn:false,lastMove:null,
    eventLog:[],chaos:18,moves:0,soundEnabled:true,decisionUnlockTimer:null,
    forceOpponentRush:null,attempts:1,wins:0,losses:0,
    items:{spray:1,ice:1,lucky:1},luckyGuard:false,supply60:false,supply85:false
  };

  const $=id=>document.getElementById(id);
  const boardEl=$('board'),turnLabel=$('turnLabel'),rescueLabel=$('rescueLabel');
  const eventBadge=$('eventBadge'),currentEvent=$('currentEvent'),eventLogEl=$('eventLog'),eventCount=$('eventCount');
  const restartBtn=$('restartBtn'),soundBtn=$('soundBtn'),acceptBtn=$('acceptBtn'),rescueBtn=$('rescueBtn');
  const winOverlay=$('winOverlay'),winEmoji=$('winEmoji'),winTitle=$('winTitle'),winText=$('winText'),overlayRestartBtn=$('overlayRestartBtn');
  const accidentOverlay=$('accidentOverlay'),accidentIcon=$('accidentOverlayIcon'),accidentTitle=$('accidentOverlayTitle'),accidentLead=$('accidentOverlayLead'),accidentNext=$('accidentOverlayNext'),accidentTarget=$('accidentOverlayTarget'),accidentAuto=$('accidentOverlayAuto'),accidentActions=$('accidentOverlayActions'),overlayAccept=$('overlayAcceptAccidentBtn'),overlayRescue=$('overlayRescueAccidentBtn');
  const challengeAttempt=$('challengeAttempt'),challengeRecord=$('challengeRecord'),chaosPercent=$('chaosPercent'),chaosStage=$('chaosStage'),chaosFill=$('chaosFill'),chaosCaption=$('chaosCaption'),accidentTier=$('accidentTier');
  const itemSpray=$('itemSpray'),itemIce=$('itemIce'),itemLucky=$('itemLucky');
  const itemSprayCount=$('itemSprayCount'),itemIceCount=$('itemIceCount'),itemLuckyCount=$('itemLuckyCount'),itemGuard=$('itemGuard');

  let audioContext=null;
  loadStats();

  function emptyBoard(){return Array.from({length:SIZE},()=>Array(SIZE).fill(EMPTY));}
  function loadStats(){try{const x=JSON.parse(localStorage.getItem('crazyGomokuChallenge')||'{}');state.attempts=Math.max(1,x.attempts||1);state.wins=x.wins||0;state.losses=x.losses||0;}catch(_){}}
  function saveStats(){try{localStorage.setItem('crazyGomokuChallenge',JSON.stringify({attempts:state.attempts,wins:state.wins,losses:state.losses}));}catch(_){}}

  function ensureAudio(){if(!state.soundEnabled)return null;const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audioContext)audioContext=new C();if(audioContext.state==='suspended')audioContext.resume();return audioContext;}
  function tone(freq,dur,{type='sine',vol=.07,end=freq,delay=0}={}){const ctx=ensureAudio();if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+dur+.03);}
  function noise(dur=.2,{vol=.07,delay=0,low=2600}={}){const ctx=ensureAudio();if(!ctx)return;const n=Math.floor(ctx.sampleRate*dur),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='lowpass';f.frequency.value=low;g.gain.value=vol;s.buffer=b;s.connect(f).connect(g).connect(ctx.destination);s.start(ctx.currentTime+delay);}
  function sound(name){if(!state.soundEnabled)return;switch(name){case'stone':tone(115,.13,{type:'triangle',vol:.13,end:70});noise(.08,{vol:.04,low:1700});break;case'accident':noise(.3,{vol:.12,low:8000});tone(950,.25,{type:'sawtooth',vol:.07,end:280});tone(230,.42,{type:'square',vol:.08,delay:.2,end:205});break;case'boom':noise(.5,{vol:.18,low:1900});tone(90,.45,{type:'sawtooth',vol:.14,end:30});break;case'bonus':[392,523,659,784].forEach((f,i)=>tone(f,.18,{type:'square',vol:.055,delay:i*.08,end:f*1.06}));break;case'rescue':case'item':[440,554,659,880].forEach((f,i)=>tone(f,.18,{type:'triangle',vol:.06,delay:i*.07,end:f*1.04}));break;case'win':[523,659,784,1047].forEach((f,i)=>tone(f,.3,{type:'triangle',vol:.075,delay:i*.1,end:f*1.03}));break;case'lose':[392,330,262,196].forEach((f,i)=>tone(f,.3,{type:'sawtooth',vol:.05,delay:i*.12,end:f*.8}));break;}}

  function initBoard(){boardEl.innerHTML='';for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const cell=document.createElement('div');cell.className='cell';cell.dataset.row=r;cell.dataset.col=c;cell.dataset.coord=toCoord(r,c);const p=document.createElement('span');p.className='preview';cell.appendChild(p);cell.addEventListener('click',()=>playerClick(r,c));boardEl.appendChild(cell);}render();}
  function render(){const cells=boardEl.children;for(let i=0;i<cells.length;i++){const r=Math.floor(i/SIZE),c=i%SIZE,cell=cells[i];const old=cell.querySelector('.stone');if(old)old.remove();const v=state.board[r][c];if(v!==EMPTY){const s=document.createElement('span');s.className=`stone ${v===BLACK?'black':'white'}`;if(state.lastMove&&state.lastMove[0]===r&&state.lastMove[1]===c)s.classList.add('new');cell.appendChild(s);}}
    turnLabel.textContent=state.gameOver?'🏁 本局结束':state.current===BLACK?'⚫ 轮到你下':state.aiThinking?'⚪ AI 正在想…':'⚪ AI 回合';
    rescueLabel.textContent=`🛠 化解 ×${state.playerRescues}`;
    acceptBtn.disabled=!state.pending||state.pending.player!==BLACK;rescueBtn.disabled=!state.pending||state.pending.player!==BLACK||state.playerRescues<=0;
    updateChallengeUI();updateChaosUI();updateItemsUI();
  }

  function updateChallengeUI(){if(challengeAttempt)challengeAttempt.textContent=`第 ${state.attempts} 次挑战`;if(challengeRecord)challengeRecord.textContent=`${state.wins} 胜 / ${state.losses} 负`;}
  function stageInfo(){if(state.chaos<30)return['困难开局','玩家意外约 28% · 还有较多正常落子空间'];if(state.chaos<60)return['开始失控','玩家意外约 36% · 随机性明显增强'];if(state.chaos<80)return['高危','玩家意外约 46% · 重度 Debuff 出现'];return['疯狂时刻','玩家意外约 56% · 高危但仍有操作空间'];}
  function updateChaosUI(){const[p,c]=stageInfo();if(chaosPercent)chaosPercent.textContent=`${state.chaos}%`;if(chaosStage)chaosStage.textContent=p;if(chaosFill)chaosFill.style.width=`${state.chaos}%`;if(chaosCaption)chaosCaption.textContent=c;document.body.classList.toggle('chaos-max',state.chaos>=80);}
  function bumpChaos(n){const before=state.chaos;state.chaos=Math.max(0,Math.min(100,state.chaos+n));updateChaosUI();if(n>0)checkSupplyDrop(before,state.chaos);updateItemsUI();}
  function accidentChance(player){const playerChance=state.chaos<30?.28:state.chaos<60?.36:state.chaos<80?.46:.56;const aiChance=state.chaos<30?.20:state.chaos<60?.28:state.chaos<80?.36:.44;let chance=player===BLACK?playerChance:aiChance;if(player===BLACK&&state.luckyGuard)chance=Math.max(.08,chance-.30);return chance;}
  function unlockedEvents(){if(state.chaos<30)return EVENTS.filter(e=>e.tier===LIGHT||e.id==='wild');if(state.chaos<60)return EVENTS.filter(e=>e.tier!==HEAVY);return EVENTS;}
  function eventWeight(ev,player){const tierBoost=state.chaos>=80?(ev.tier===HEAVY?1.8:1):state.chaos>=60?(ev.tier===HEAVY?1.35:1):1;let biasWeight=1;if(player===BLACK){biasWeight=ev.bias===BAD?4.2:ev.bias===GOOD?.45:1.8;}else{biasWeight=ev.bias===BAD?1.35:ev.bias===GOOD?2.2:1.8;}if(ev.id==='wild'&&player===BLACK)biasWeight*=1.35;if(ev.id==='flip'&&player===BLACK)biasWeight*=1.3;if(ev.id==='opponentRush'&&player===BLACK)biasWeight*=1.4;return tierBoost*biasWeight;}
  function weightedPick(items,player){const weighted=items.map(ev=>({ev,w:eventWeight(ev,player)}));const total=weighted.reduce((s,x)=>s+x.w,0);let roll=Math.random()*total;for(const x of weighted){roll-=x.w;if(roll<=0)return x.ev;}return weighted[weighted.length-1].ev;}
  function maybeEvent(player){if(Math.random()>=accidentChance(player))return null;return weightedPick(unlockedEvents(),player);}

  function canUseItem(id){const item=ITEMS[id];return !!item&&!state.gameOver&&state.current===BLACK&&!state.aiThinking&&!state.overlayActive&&!state.pending&&(state.items[id]||0)>0&&state.chaos>=item.minChaos;}
  function updateItemsUI(){const usable=id=>canUseItem(id);if(itemSprayCount)itemSprayCount.textContent=`×${state.items.spray}`;if(itemIceCount)itemIceCount.textContent=`×${state.items.ice}`;if(itemLuckyCount)itemLuckyCount.textContent=`×${state.items.lucky}`;if(itemSpray)itemSpray.disabled=!usable('spray');if(itemIce)itemIce.disabled=!usable('ice');if(itemLucky)itemLucky.disabled=!usable('lucky')||state.luckyGuard;if(itemGuard)itemGuard.classList.toggle('hidden',!state.luckyGuard);}
  function useItem(id){if(!canUseItem(id))return;const item=ITEMS[id],before=state.chaos;state.items[id]--;bumpChaos(-item.reduce);if(id==='lucky')state.luckyGuard=true;sound('item');const extra=id==='lucky'?'，下一步意外率大幅下降。':'';showSideEvent({icon:item.icon,title:`${item.name}已使用`,lead:`疯狂值 ${before}% → ${state.chaos}%${extra}`},false);render();}
  function checkSupplyDrop(before,after){if(!state.supply60&&before<60&&after>=60){state.supply60=true;setTimeout(()=>awardSupply(60),220);}if(!state.supply85&&before<85&&after>=85){state.supply85=true;setTimeout(()=>awardSupply(85),220);}}
  function awardSupply(level){const ids=['spray','ice','lucky'],id=ids[Math.floor(Math.random()*ids.length)],item=ITEMS[id];state.items[id]++;sound('bonus');showSideEvent({icon:'🎁',title:`${level}% 紧急补给！`,lead:`捡到 ${item.icon} ${item.name} ×1。关键时刻再用！`},false);render();}

  if(itemSpray)itemSpray.addEventListener('click',()=>useItem('spray'));
  if(itemIce)itemIce.addEventListener('click',()=>useItem('ice'));
  if(itemLucky)itemLucky.addEventListener('click',()=>useItem('lucky'));

  function playerClick(r,c){ensureAudio();if(state.gameOver||state.current!==BLACK||state.aiThinking||state.overlayActive||state.pending)return;if(state.board[r][c]!==EMPTY)return;attemptMove(BLACK,r,c,true);}
  function attemptMove(player,r,c,canRescue){const guarded=player===BLACK&&state.luckyGuard;const ev=maybeEvent(player);if(guarded){state.luckyGuard=false;updateItemsUI();}if(!ev){if(guarded)showSideEvent({icon:'🍀',title:'幸运护符生效',lead:'这一步躲过了意外！'},false);placeStone(player,r,c);return;}bumpChaos(10);const pending={event:ev,player,row:r,col:c};state.pending=pending;logEvent(ev,player);showSideEvent(ev,true);showOverlay(pending,canRescue&&player===BLACK);}

  function tierLabel(t){return t===LIGHT?'轻度意外':t===MEDIUM?'中度意外':'重度意外';}
  function showOverlay(pending,canRescue){const{event:ev,player,row,col}=pending;state.overlayActive=true;accidentIcon.textContent=ev.icon;accidentTitle.textContent=`${ev.title}！`;accidentLead.textContent=ev.lead;accidentNext.textContent=ev.next;accidentTarget.textContent=`🎯 ${player===BLACK?'你原本想下':'AI 原本想下'}：${toCoord(row,col)}`;
    if(accidentTier){accidentTier.textContent=`${ev.tier===HEAVY?'☠️':ev.tier===MEDIUM?'⚠️':'🎲'} ${tierLabel(ev.tier)}`;accidentTier.className=`accident-tier ${ev.tier}`;}
    accidentOverlay.classList.remove('hidden');accidentActions.classList.toggle('hidden',!canRescue);accidentAuto.classList.toggle('hidden',canRescue);
    if(canRescue){overlayAccept.disabled=true;overlayRescue.disabled=true;overlayRescue.textContent=`🛠 立即化解 ×${state.playerRescues}`;setFoot('📢 意外播报中……');clearTimeout(state.decisionUnlockTimer);state.decisionUnlockTimer=setTimeout(()=>{overlayAccept.disabled=false;overlayRescue.disabled=state.playerRescues<=0;setFoot('⏸ 你来决定什么时候继续 · 化解会额外 +12 疯狂值');},DECISION_LOCK_MS);}else{accidentAuto.disabled=true;accidentAuto.textContent='📢 AI 触发意外 · 正在播报……';setFoot('⏸ AI 不会自动继续');clearTimeout(state.decisionUnlockTimer);state.decisionUnlockTimer=setTimeout(()=>{accidentAuto.disabled=false;accidentAuto.textContent='🎬 我看懂了，让 AI 继续';setFoot('⏸ 你不点，棋局就停在这里');},DECISION_LOCK_MS);}
    document.body.classList.add('chaos-shake');setTimeout(()=>document.body.classList.remove('chaos-shake'),500);sound('accident');
  }
  function hideOverlay(){state.overlayActive=false;accidentOverlay.classList.add('hidden');}
  function setFoot(t){const f=document.querySelector('.accident-footnote');if(f)f.textContent=t;}

  function acceptCurrent(){if(!state.pending)return;const p=state.pending;state.pending=null;hideOverlay();setTimeout(()=>resolveEvent(p),560);}
  function rescueCurrent(){if(!state.pending||state.playerRescues<=0)return;const p=state.pending;state.pending=null;state.playerRescues--;bumpChaos(12);hideOverlay();sound('rescue');showSideEvent({icon:'🛠️',title:'化解成功，但更疯了',lead:'救回这一步，疯狂值额外上涨 12%。'},false);setTimeout(()=>placeStone(BLACK,p.row,p.col),560);render();}
  overlayAccept.addEventListener('click',()=>{if(!overlayAccept.disabled)acceptCurrent();});overlayRescue.addEventListener('click',()=>{if(!overlayRescue.disabled)rescueCurrent();});acceptBtn.addEventListener('click',acceptCurrent);rescueBtn.addEventListener('click',rescueCurrent);
  accidentAuto.addEventListener('click',()=>{if(accidentAuto.disabled||!state.pending)return;accidentAuto.disabled=true;accidentAuto.textContent='✅ 已确认 · 正在执行……';acceptCurrent();});

  function resolveEvent(p){const{event:ev,player,row,col}=p;switch(ev.id){
    case'blocked':if(player===BLACK){showSideEvent({icon:'🎯',title:'重新选择',lead:'这格不能下，换一个位置。'},false);state.current=BLACK;render();}else{const m=chooseAiMove();if(m)placeStone(WHITE,m[0],m[1]);}break;
    case'drift':{const m=randomInRadius(row,col,3);if(m)placeStone(player,m[0],m[1]);else placeStone(player,row,col);}break;
    case'drop':sound('boom');endTurn(player);break;
    case'bonus':state.extraTurn=true;sound('bonus');placeStone(player,row,col);break;
    case'wild':{const m=randomEmpty();if(m)placeStone(player,m[0],m[1]);else finishDraw();}break;
    case'teleport':{const m=randomFarEmpty(row,col,7)||randomEmpty();if(m)placeStone(player,m[0],m[1]);else finishDraw();}break;
    case'blackhole':placeStoneWithAfter(player,row,col,()=>removeOwnStoneWeighted(player));break;
    case'swap':placeStoneWithAfter(player,row,col,()=>swapRandomOpponents());break;
    case'reinforce':placeStoneWithAfter(player,row,col,()=>addNeighborStone(player,row,col));break;
    case'confiscate':placeStoneWithAfter(player,row,col,()=>removeRandomOwnStone(player));break;
    case'explode':placeStoneWithAfter(player,row,col,()=>explodeAround(row,col,4));break;
    case'flip':placeStone(player,row,col,true,player===BLACK?WHITE:BLACK);break;
    case'storm':placeStoneWithAfter(player,row,col,()=>stormShuffle(4));break;
    case'double':placeStoneWithAfter(player,row,col,()=>addRandomStone(player));break;
    case'opponentRush':placeStoneWithAfter(player,row,col,()=>grantOpponentRush(player));break;
  }}

  function placeStoneWithAfter(player,r,c,after){if(!canPlace(r,c)){const m=randomEmpty();if(!m)return;[r,c]=m;}state.board[r][c]=player;state.lastMove=[r,c];sound('stone');render();if(checkWin(state.board,r,c,player))return finish(player);after();render();if(scanWinner(BLACK))return finish(BLACK);if(scanWinner(WHITE))return finish(WHITE);finishMove(player);}
  function placeStone(player,r,c,skipEvent=false,overrideColor=null){if(!canPlace(r,c)){const m=randomEmpty();if(!m)return finishDraw();[r,c]=m;}const color=overrideColor||player;state.board[r][c]=color;state.lastMove=[r,c];sound('stone');render();if(checkWin(state.board,r,c,color))return finish(color);finishMove(player);}
  function finishMove(player){state.moves++;bumpChaos(5);if(boardFull())return finishDraw();if(state.extraTurn){state.extraTurn=false;showSideEvent({icon:'⚡',title:'额外一步',lead:player===BLACK?'继续下！':'AI 还要再下一颗。'},false);if(player===WHITE){state.current=WHITE;state.aiThinking=true;render();setTimeout(aiMove,1250);}else{state.current=BLACK;render();}return;}if(state.forceOpponentRush){const rushed=state.forceOpponentRush;state.forceOpponentRush=null;if(rushed===WHITE){state.current=WHITE;state.aiThinking=true;showSideEvent({icon:'👹',title:'AI 插队！',lead:'它马上额外走一步。'},false);render();setTimeout(aiMove,1200);return;}if(rushed===BLACK){state.current=BLACK;showSideEvent({icon:'👹',title:'你被塞了一步',lead:'这次反而轮到你额外走。'},false);render();return;}}endTurn(player);}
  function endTurn(player){if(state.gameOver)return;state.current=player===BLACK?WHITE:BLACK;showSideEvent({icon:'🎲',title:'等待下一步',lead:state.chaos>=80?'疯狂时刻！下一步非常危险。':'下一颗棋，可能突然出事。'},false);render();if(state.current===WHITE){state.aiThinking=true;render();setTimeout(aiMove,AI_THINK_MS);}}
  function aiMove(){if(state.gameOver)return;state.current=WHITE;state.aiThinking=true;render();const m=chooseAiMove();state.aiThinking=false;if(!m)return finishDraw();attemptMove(WHITE,m[0],m[1],false);}

  function canPlace(r,c){return inBounds(r,c)&&state.board[r][c]===EMPTY;}
  function randomEmpty(){const a=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(state.board[r][c]===EMPTY)a.push([r,c]);return a.length?a[Math.floor(Math.random()*a.length)]:null;}
  function randomFarEmpty(r,c,minDist=7){const a=[];for(let rr=0;rr<SIZE;rr++)for(let cc=0;cc<SIZE;cc++)if(state.board[rr][cc]===EMPTY&&(Math.abs(rr-r)+Math.abs(cc-c)>=minDist))a.push([rr,cc]);return a.length?a[Math.floor(Math.random()*a.length)]:null;}
  function randomInRadius(r,c,radius=3){const a=[];for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(canPlace(rr,cc))a.push([rr,cc]);}return a.length?a[Math.floor(Math.random()*a.length)]:null;}
  function occupied(filter=null){const a=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(state.board[r][c]!==EMPTY&&(!filter||state.board[r][c]===filter))a.push([r,c]);return a;}
  function removeRandomOwnStone(player){const a=occupied(player);if(!a.length)return;const[r,c]=a[Math.floor(Math.random()*a.length)];state.board[r][c]=EMPTY;sound('boom');}
  function removeOwnStoneWeighted(player){const own=occupied(player),all=occupied();const pool=own.length&&Math.random()<.75?own:all;if(!pool.length)return;const[r,c]=pool[Math.floor(Math.random()*pool.length)];state.board[r][c]=EMPTY;sound('boom');}
  function swapRandomOpponents(){const b=occupied(BLACK),w=occupied(WHITE);if(!b.length||!w.length)return;const p=b[Math.floor(Math.random()*b.length)],q=w[Math.floor(Math.random()*w.length)];state.board[p[0]][p[1]]=WHITE;state.board[q[0]][q[1]]=BLACK;}
  function addNeighborStone(player,r,c){const m=randomInRadius(r,c,2);if(m)state.board[m[0]][m[1]]=player;}
  function addRandomStone(player){const m=randomEmpty();if(m)state.board[m[0]][m[1]]=player;}
  function explodeAround(r,c,count=4){const a=[];for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(inBounds(rr,cc)&&state.board[rr][cc]!==EMPTY)a.push([rr,cc]);}shuffle(a);a.slice(0,count).forEach(([rr,cc])=>state.board[rr][cc]=EMPTY);sound('boom');}
  function stormShuffle(count=4){const a=occupied();shuffle(a);for(const[r,c]of a.slice(0,count)){const color=state.board[r][c],m=randomFarEmpty(r,c,5)||randomEmpty();if(!m)continue;state.board[r][c]=EMPTY;state.board[m[0]][m[1]]=color;}}
  function grantOpponentRush(player){state.forceOpponentRush=player===BLACK?WHITE:BLACK;}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  function chooseAiMove(){const cand=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){if(state.board[r][c]!==EMPTY)continue;let score=evaluate(r,c,WHITE)*1.12+evaluate(r,c,BLACK)*1.15+(7-(Math.abs(7-r)+Math.abs(7-c))*.08)+Math.random()*.3;cand.push({r,c,score});}cand.sort((a,b)=>b.score-a.score);return cand[0]?[cand[0].r,cand[0].c]:null;}
  function evaluate(r,c,p){let s=0;state.board[r][c]=p;for(const[dr,dc]of[[1,0],[0,1],[1,1],[1,-1]]){const len=1+countDir(r,c,dr,dc,p)+countDir(r,c,-dr,-dc,p);s+=len>=5?100000:len===4?8000:len===3?900:len===2?90:8;}state.board[r][c]=EMPTY;return s;}
  function countDir(r,c,dr,dc,p){let n=0;r+=dr;c+=dc;while(inBounds(r,c)&&state.board[r][c]===p){n++;r+=dr;c+=dc;}return n;}
  function checkWin(board,r,c,p){return[[1,0],[0,1],[1,1],[1,-1]].some(([dr,dc])=>1+countOn(board,r,c,dr,dc,p)+countOn(board,r,c,-dr,-dc,p)>=5);}
  function countOn(board,r,c,dr,dc,p){let n=0;r+=dr;c+=dc;while(inBounds(r,c)&&board[r][c]===p){n++;r+=dr;c+=dc;}return n;}
  function scanWinner(p){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(state.board[r][c]===p&&checkWin(state.board,r,c,p))return true;return false;}
  function inBounds(r,c){return r>=0&&r<SIZE&&c>=0&&c<SIZE;}
  function boardFull(){return state.board.every(row=>row.every(v=>v!==EMPTY));}
  function toCoord(r,c){return `${String.fromCharCode(65+c)}${r+1}`;}

  function showSideEvent(ev,active){eventBadge.textContent=active?'意外发生！':'进行中';currentEvent.innerHTML=`<div class="event-icon">${ev.icon}</div><div><h2>${ev.title}</h2><p>${ev.lead||ev.next||''}</p></div>`;}
  function logEvent(ev,p){state.eventLog.unshift(`${ev.icon} ${p===BLACK?'你':'AI'}：${ev.title}`);renderLog();}
  function renderLog(){eventCount.textContent=`${state.eventLog.length} 次`;eventLogEl.innerHTML='';if(!state.eventLog.length){const li=document.createElement('li');li.className='muted';li.textContent='暂时安全……';eventLogEl.appendChild(li);return;}state.eventLog.slice(0,3).forEach(t=>{const li=document.createElement('li');li.textContent=t;eventLogEl.appendChild(li);});}

  function finish(player){if(state.gameOver)return;state.gameOver=true;hideOverlay();if(player===BLACK){state.wins++;sound('win');winEmoji.textContent='🏆';winTitle.textContent='挑战成功！';winText.textContent=`第 ${state.attempts} 次挑战，终于赢下一把！`;}else{state.losses++;sound('lose');winEmoji.textContent='🤖';winTitle.textContent='挑战失败';winText.textContent='这版更难了。再来，目标还是赢一把。';}saveStats();render();winOverlay.classList.remove('hidden');}
  function finishDraw(){state.gameOver=true;hideOverlay();winEmoji.textContent='🤝';winTitle.textContent='平局';winText.textContent='这把不算输，但挑战还没完成。';winOverlay.classList.remove('hidden');render();}
  function resetGame(countAttempt=true){clearTimeout(state.decisionUnlockTimer);if(countAttempt&&state.moves>0){state.attempts++;saveStats();}state.board=emptyBoard();state.current=BLACK;state.gameOver=false;state.playerRescues=3;state.pending=null;state.overlayActive=false;state.aiThinking=false;state.extraTurn=false;state.forceOpponentRush=null;state.lastMove=null;state.eventLog=[];state.chaos=18;state.moves=0;state.items={spray:1,ice:1,lucky:1};state.luckyGuard=false;state.supply60=false;state.supply85=false;winOverlay.classList.add('hidden');accidentOverlay.classList.add('hidden');showSideEvent({icon:'🎒',title:'救命道具已装包',lead:'难度没降，但你现在有三种道具可以压住疯狂值。'},false);renderLog();render();}

  restartBtn.addEventListener('click',()=>resetGame(true));
  overlayRestartBtn.addEventListener('click',()=>{state.attempts++;saveStats();resetGame(false);});
  soundBtn.addEventListener('click',()=>{state.soundEnabled=!state.soundEnabled;soundBtn.textContent=state.soundEnabled?'📢 离谱音效 ON':'🔇 音效 OFF';if(state.soundEnabled)ensureAudio();});

  window.CrazyGomoku={checkWin,createEmptyBoard:emptyBoard,SIZE,BLACK,WHITE,EMPTY};
  initBoard();resetGame(false);
})();