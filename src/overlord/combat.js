// Exact animation names from decoded source tables. Ambiguous suffix matches fail closed.
export function resolveClip(clips,resourceId,name){
  const value=String(name||'').trim();
  let matches=clips.map((clip,index)=>({clip,index})).filter(({clip})=>clip.name===value||clip.name===`${resourceId}_${value}`);
  if(!matches.length)matches=clips.map((clip,index)=>({clip,index})).filter(({clip})=>clip.name.endsWith(`_${value}`));
  return matches.length===1?matches[0].index:null;
}

export function findSourcePath(combos,targetId){
  const byId=new Map(combos.map(c=>[String(c.id),c]));
  const target=byId.get(String(targetId));if(!target)return [];
  const roots=combos.filter(c=>!c.inputPrefix);
  const pending=roots.map(c=>[c]),visited=new Set();
  while(pending.length){const path=pending.shift(),current=path.at(-1),id=String(current.id);if(id===String(targetId))return path;if(visited.has(id))continue;visited.add(id);for(const nextId of current.nextIds||[]){const next=byId.get(String(nextId));if(next)pending.push([...path,next]);}}
  return [];
}
