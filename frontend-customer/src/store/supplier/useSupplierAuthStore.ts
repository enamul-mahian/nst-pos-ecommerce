import { create } from 'zustand';
import { apiClient, handleApiError } from '../../api/client';

interface SupplierProfile { id:number; supplier_code:string; name:string; phone?:string; email?:string; address?:string; supplier_since?:string; status?:string; reliability_score?:number|string; }
interface SupplierUser { id:number; name:string; email?:string; phone?:string; profile_type:'supplier'; can_access_pos:false; portal:'supplier'; }
interface SupplierAuthState {
  user: SupplierUser | null; supplier: SupplierProfile | null; token: string | null; isAuthenticated:boolean; isLoading:boolean; error:string|null;
  initialize:()=>void; login:(login:string,password:string,captchaToken?:string)=>Promise<void>; fetchProfile:()=>Promise<void>; logout:()=>Promise<void>;
}
export const useSupplierAuthStore=create<SupplierAuthState>((set)=>({
  user:null,supplier:null,token:null,isAuthenticated:false,isLoading:false,error:null,
  initialize:()=>{try{const token=localStorage.getItem('nst_supplier_token');const raw=localStorage.getItem('nst_supplier_session');if(token&&raw){const session=JSON.parse(raw);set({token,user:session.user,supplier:session.supplier,isAuthenticated:true,isLoading:false,error:null});}else{set({user:null,supplier:null,token:null,isAuthenticated:false,isLoading:false,error:null});}}catch{localStorage.removeItem('nst_supplier_token');localStorage.removeItem('nst_supplier_session');set({user:null,supplier:null,token:null,isAuthenticated:false,isLoading:false,error:null});}},
  login:async(login,password,captchaToken)=>{set({isLoading:true,error:null});try{const {data}=await apiClient.post('/public/supplier-login',{login,password,hcaptcha_token:captchaToken||undefined},{headers:{'X-NST-Portal':'supplier'}});if(!data?.status||!data?.token)throw new Error(data?.message||'Supplier login failed.');const session={user:data.user||data.data?.user,supplier:data.supplier||data.data?.supplier};localStorage.setItem('nst_supplier_token',data.token);localStorage.setItem('nst_supplier_session',JSON.stringify(session));set({token:data.token,...session,isAuthenticated:true,isLoading:false});}catch(error:any){const parsed=handleApiError(error);set({isLoading:false,error:parsed.message});throw parsed;}},
  fetchProfile:async()=>{set({isLoading:true});try{const {data}=await apiClient.get('/supplier-portal/profile',{headers:{'X-NST-Portal':'supplier'}});const session=data.data;localStorage.setItem('nst_supplier_session',JSON.stringify(session));set({user:session.user,supplier:session.supplier,isAuthenticated:true,isLoading:false});}catch(error:any){const parsed=handleApiError(error);set({isLoading:false,error:parsed.message});throw parsed;}},
  logout:async()=>{try{await apiClient.post('/supplier-portal/logout',{}, {headers:{'X-NST-Portal':'supplier'}});}catch{}finally{localStorage.removeItem('nst_supplier_token');localStorage.removeItem('nst_supplier_session');set({user:null,supplier:null,token:null,isAuthenticated:false,isLoading:false,error:null});}},
}));

if (typeof window !== 'undefined') {
  window.addEventListener('nst-supplier-session-expired', () => {
    useSupplierAuthStore.setState({
      user: null,
      supplier: null,
      token: null,
      isAuthenticated: false,
      error: 'Your supplier session has expired. Please login again.',
    });
  });
}

// Restore the saved supplier session synchronously so a refreshed/deep-linked
// /supplier/* page isn't redirected to the login page (and then to the dashboard).
if (typeof window !== 'undefined') {
  useSupplierAuthStore.getState().initialize();
}
