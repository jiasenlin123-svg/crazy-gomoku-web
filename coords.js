(function(){
  const board=document.getElementById('board');
  const wrap=document.querySelector('.board-wrap');
  const overlay=document.getElementById('accidentOverlay');
  const target=document.getElementById('accidentOverlayTarget');
  if(!board||!wrap)return;

  const letters=Array.from({length:15},(_,i)=>String.fromCharCode(65+i));
  const numbers=Array.from({length:15},(_,i)=>String(i+1));

  function axis(className,items){
    const el=document.createElement('div');
    el.className=`board-coords ${className}`;
    el.setAttribute('aria-hidden','true');
    items.forEach(item=>{const span=document.createElement('span');span.textContent=item;el.appendChild(span);});
    wrap.appendChild(el);
  }

  axis('board-coords-x board-coords-top',letters);
  axis('board-coords-x board-coords-bottom',letters);
  axis('board-coords-y board-coords-left',numbers);
  axis('board-coords-y board-coords-right',numbers);

  Array.from(board.children).forEach((cell,index)=>{
    const row=Math.floor(index/15),col=index%15;
    const coord=`${letters[col]}${row+1}`;
    cell.dataset.coord=coord;
    cell.setAttribute('aria-label',coord);
  });

  let highlighted=null;
  let clearTimer=null;
  function clearHighlight(){
    if(clearTimer)clearTimeout(clearTimer);
    clearTimer=null;
    if(!highlighted)return;
    const flare=highlighted.querySelector('.accident-target-flare');
    if(flare)flare.remove();
    highlighted=null;
  }
  function highlight(coord){
    clearHighlight();
    const match=/^([A-O])(1[0-5]|[1-9])$/.exec(coord||'');
    if(!match)return;
    const col=match[1].charCodeAt(0)-65,row=Number(match[2])-1;
    const cell=board.children[row*15+col];
    if(!cell)return;
    const flare=document.createElement('span');
    flare.className='accident-target-flare';
    flare.textContent=coord;
    cell.appendChild(flare);
    highlighted=cell;
  }
  function sync(){
    if(!target)return;
    const match=target.textContent.match(/\b([A-O](?:1[0-5]|[1-9]))\b/);
    if(match)highlight(match[1]);
  }

  if(target)new MutationObserver(sync).observe(target,{childList:true,characterData:true,subtree:true});
  if(overlay)new MutationObserver(()=>{
    if(!overlay.classList.contains('hidden'))sync();
    else if(highlighted)clearTimer=setTimeout(clearHighlight,2800);
  }).observe(overlay,{attributes:true,attributeFilter:['class']});
})();
