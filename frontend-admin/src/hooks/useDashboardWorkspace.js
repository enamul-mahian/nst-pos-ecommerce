import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const clone = value => JSON.parse(JSON.stringify(value));
const breakpoint = () => window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop';
const emptyState = (layout) => ({
  activeWorkspaceId:'default',
  workspaces:[{
    id:'default',
    name:'My Dashboard',
    roleDefault:false,
    layouts:{desktop:clone(layout),tablet:clone(layout),mobile:clone(layout)},
  }],
  quickActions:[],
  moduleShortcuts:[],
  history:[],
  version:1,
  updatedAt:new Date().toISOString(),
});

const toNumber = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// A saved rectangle can be broken (0 height, NaN, off-grid) after an old layout or a bad import.
// Such widgets used to render as thin empty pills, so they fall back to the default size.
const repairRect = (rect, base) => {
  const w = Math.min(12, Math.max(1, Math.round(toNumber(rect.w, base.w))));
  let h = Math.round(toNumber(rect.h, base.h));
  if (h < Math.max(3, Math.min(base.h, 4))) h = base.h;
  return {
    ...rect,
    x: Math.min(12 - w, Math.max(0, Math.round(toNumber(rect.x, base.x)))),
    y: Math.max(0, Math.round(toNumber(rect.y, base.y))),
    w,
    h,
    locked: Boolean(rect.locked),
  };
};

const compactClientHistory = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history.slice(-20).map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const snapshot = item.snapshot && typeof item.snapshot === 'object' ? clone(item.snapshot) : null;
    if (snapshot && snapshot.history) snapshot.history = [];
    return {
      id: item.id || item.version || Date.now() + index,
      version: item.version ? Number(item.version) : null,
      savedAt: item.savedAt || item.saved_at || new Date().toISOString(),
      stateHash: typeof item.stateHash === 'string' ? item.stateHash : (typeof item.state_hash === 'string' ? item.state_hash : null),
      snapshot,
    };
  }).filter(Boolean);
};

const stripVolatileDashboardPayload = (value) => {
  const copy = clone(value);
  copy.history = [];
  copy.workspaces = Array.isArray(copy.workspaces) ? copy.workspaces.map((workspace) => ({
    ...workspace,
    history: [],
  })) : [];
  return copy;
};

export default function useDashboardWorkspace({storageKey, defaultLayout, allowedWidgetIds}) {
  const storedRef = useRef(null);
  if (storedRef.current === null) {
    try { storedRef.current = localStorage.getItem(storageKey); } catch { storedRef.current = ''; }
  }

  const [device,setDevice]=useState(breakpoint);
  const [state,setState]=useState(()=>{
    try { return storedRef.current ? JSON.parse(storedRef.current) : emptyState(defaultLayout); }
    catch { return emptyState(defaultLayout); }
  });
  const [draft,setDraft]=useState(null);
  const [undo,setUndo]=useState([]);
  const [redo,setRedo]=useState([]);
  const [lastSaveError,setLastSaveError]=useState('');
  const [hydrating,setHydrating]=useState(true);
  const baseline=useRef(null);

  const sanitize=useCallback((value)=>{
    const fallback = emptyState(defaultLayout);
    const next = value && typeof value === 'object' ? clone(value) : fallback;
    next.workspaces = Array.isArray(next.workspaces) && next.workspaces.length ? next.workspaces : fallback.workspaces;
    next.workspaces = next.workspaces.map((workspace, index) => {
      const layouts = workspace?.layouts || {};
      const normalizedLayouts = {};
      for (const bp of ['desktop','tablet','mobile']) {
        const source = layouts[bp] || defaultLayout;
        let order = [...new Set((source.order || []).filter(id => allowedWidgetIds.includes(id)))];
        if (!order.length) order = [...(defaultLayout.order || [])];
        const positions = {};
        for (const id of allowedWidgetIds) {
          const base = defaultLayout.positions?.[id] || {x:0,y:0,w:3,h:5,locked:false};
          positions[id] = repairRect({ ...base, ...(source.positions?.[id] || {}) }, base);
        }
        normalizedLayouts[bp] = {...clone(defaultLayout), ...source, order, positions};
      }
      return {
        id: workspace?.id || `workspace-${index + 1}`,
        name: workspace?.name || `Workspace ${index + 1}`,
        roleDefault:Boolean(workspace?.roleDefault),
        ...workspace,
        layouts:normalizedLayouts,
      };
    });
    if (!next.workspaces.some(workspace => workspace.id === next.activeWorkspaceId)) {
      next.activeWorkspaceId = next.workspaces[0].id;
    }
    next.quickActions = Array.isArray(next.quickActions) ? next.quickActions : [];
    next.moduleShortcuts = Array.isArray(next.moduleShortcuts) ? next.moduleShortcuts : [];
    next.history = compactClientHistory(next.history);
    next.version = Number(next.version || 1);
    return next;
  },[allowedWidgetIds,defaultLayout]);

  useEffect(()=>{
    const onResize=()=>setDevice(breakpoint());
    window.addEventListener('resize',onResize);
    return()=>window.removeEventListener('resize',onResize);
  },[]);

  useEffect(()=>{
    let mounted = true;
    setHydrating(true);
    api.get('/dashboard/stage1-state').then(response=>{
      if (!mounted) return;
      const remote = response?.data?.data;
      if (remote?.workspaces?.length) {
        // Server state is authoritative after a successful database save.
        setState(()=>sanitize(remote));
        setLastSaveError('');
      } else {
        setState(local => sanitize(local));
      }
    }).catch((error)=>{
      if (mounted) {
        setState(local => sanitize(local));
        setLastSaveError(error?.response?.data?.message || 'Dashboard layout database sync could not be checked.');
      }
    }).finally(()=>{
      if (mounted) setHydrating(false);
    });
    return()=>{mounted=false};
  },[storageKey,sanitize]);

  useEffect(()=>{
    try { localStorage.setItem(storageKey,JSON.stringify(state)); }
    catch {}
  },[state,storageKey]);

  const editing=Boolean(draft);
  const currentState=sanitize(draft||state);
  const workspace=currentState.workspaces.find(w=>w.id===currentState.activeWorkspaceId)||currentState.workspaces[0];
  const layout=workspace?.layouts?.[device]||defaultLayout;

  const begin=()=>{baseline.current=clone(state);setDraft(sanitize(state));setUndo([]);setRedo([]);setLastSaveError('')};
  const cancel=()=>{setDraft(null);setUndo([]);setRedo([]);baseline.current=null;setLastSaveError('')};
  const commit=async()=>{
    if(!draft)return {state,remoteSaved:true};
    const next=sanitize({
      ...draft,
      version:(state.version||0)+1,
      updatedAt:new Date().toISOString(),
      history:[],
    });
    const payload = stripVolatileDashboardPayload(next);
    try {
      const response = await api.post('/dashboard/stage1-state',{state:payload,client_version:Number(state.version||0)});
      const remoteState = sanitize(response?.data?.data || next);
      setState(remoteState);setDraft(null);setUndo([]);setRedo([]);baseline.current=null;setLastSaveError('');
      return {state:remoteState,remoteSaved:true,version:response?.data?.version,stateHash:response?.data?.state_hash};
    } catch (error) {
      const status = error?.response?.status ? `HTTP ${error.response.status}: ` : '';
      const validation = error?.response?.data?.errors ? Object.values(error.response.data.errors).flat().join(' ') : '';
      setLastSaveError(status + (error?.response?.data?.message || validation || 'Server sync failed. Your draft is still open; fix the issue and save again.'));
      return {state:next,remoteSaved:false,error};
    }
  };

  const mutate=useCallback((fn)=>setDraft(previous=>{
    if(!previous)return previous;
    setUndo(stack=>[...stack.slice(-49),clone(previous)]);
    setRedo([]);
    const next=clone(previous);fn(next);return next;
  }),[]);
  const mutateTransient=useCallback((fn)=>setDraft(previous=>{
    if(!previous)return previous;
    const next=clone(previous);fn(next);return next;
  }),[]);
  const checkpoint=useCallback(()=>setDraft(previous=>{
    if(!previous)return previous;
    setUndo(stack=>[...stack.slice(-49),clone(previous)]);
    setRedo([]);
    return previous;
  }),[]);

  const mutateLayout=useCallback(fn=>mutate(next=>{
    const workspaceTarget=next.workspaces.find(item=>item.id===next.activeWorkspaceId);
    workspaceTarget.layouts=workspaceTarget.layouts||{};
    workspaceTarget.layouts[device]=workspaceTarget.layouts[device]||clone(defaultLayout);
    fn(workspaceTarget.layouts[device],next,workspaceTarget);
  }),[mutate,device,defaultLayout]);
  const mutateLayoutTransient=useCallback(fn=>mutateTransient(next=>{
    const workspaceTarget=next.workspaces.find(item=>item.id===next.activeWorkspaceId);
    workspaceTarget.layouts=workspaceTarget.layouts||{};
    workspaceTarget.layouts[device]=workspaceTarget.layouts[device]||clone(defaultLayout);
    fn(workspaceTarget.layouts[device],next,workspaceTarget);
  }),[mutateTransient,device,defaultLayout]);

  const undoOnce=()=>{if(!undo.length)return;const previous=undo[undo.length-1];setRedo(items=>[clone(draft),...items].slice(0,50));setDraft(previous);setUndo(items=>items.slice(0,-1))};
  const redoOnce=()=>{if(!redo.length)return;const next=redo[0];setUndo(items=>[...items,clone(draft)].slice(-50));setDraft(next);setRedo(items=>items.slice(1))};
  const addWorkspace=name=>mutate(next=>{const id=`workspace-${Date.now()}`;next.workspaces.push({id,name:name||'New Workspace',layouts:{desktop:clone(defaultLayout),tablet:clone(defaultLayout),mobile:clone(defaultLayout)}});next.activeWorkspaceId=id});
  const deleteWorkspace=id=>mutate(next=>{if(next.workspaces.length===1)return;next.workspaces=next.workspaces.filter(workspaceItem=>workspaceItem.id!==id);if(next.activeWorkspaceId===id)next.activeWorkspaceId=next.workspaces[0].id});
  const switchWorkspace=id=>(editing?mutate(next=>{next.activeWorkspaceId=id}):setState(next=>({...next,activeWorkspaceId:id})));
  const restoreVersion=id=>{const item=(currentState.history||[]).find(entry=>entry.id===id);if(item?.snapshot)mutate(next=>Object.assign(next,clone(item.snapshot)))};
  const exportJson=()=>JSON.stringify(sanitize(currentState),null,2);
  const importJson=text=>{const parsed=JSON.parse(text);if(!Array.isArray(parsed.workspaces))throw new Error('Invalid dashboard layout file.');if(!editing)begin();setDraft(sanitize(parsed))};

  return {
    device,state:currentState,workspace,layout,editing,hydrating,lastSaveError,
    begin,cancel,commit,mutate,mutateTransient,mutateLayout,mutateLayoutTransient,checkpoint,
    undoOnce,redoOnce,canUndo:undo.length>0,canRedo:redo.length>0,
    addWorkspace,deleteWorkspace,switchWorkspace,restoreVersion,exportJson,importJson,
  };
}
