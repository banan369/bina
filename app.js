const STORAGE_KEYS={needs:'bina_needs',offers:'bina_offers',messages:'bina_messages'};
const seedNeeds=[];const seedOffers=[];function load(key,seed){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw);}catch{} localStorage.setItem(key,JSON.stringify(seed));return seed;}
function save(key,data){localStorage.setItem(key,JSON.stringify(data));}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
function relativeTime(date){const d=new Date(date),mins=Math.max(0,Math.floor((Date.now()-d)/60000));if(mins<1)return 'الآن';if(mins<60)return `قبل ${mins} دقيقة`;const h=Math.floor(mins/60);if(h<24)return `قبل ${h} ساعة`;return `قبل ${Math.floor(h/24)} يوم`;}

let needs=load(STORAGE_KEYS.needs,seedNeeds),offers=load(STORAGE_KEYS.offers,seedOffers),messages=load(STORAGE_KEYS.messages,[{id:1,from:'أحمد علي',text:'مرحبًا، أقدر أساعدك في تصميم العرض. أرسل لي تفاصيل أكثر.',mine:false},{id:2,from:'أنا',text:'ممتاز، أبغاه بسيط وواضح. أرسل لك المحتوى هنا.',mine:true}]);
let currentUser=null;
const cfg=window.BINA_SUPABASE||{};
const supabaseEnabled=Boolean(cfg.url&&cfg.anonKey&&window.supabase);
const sb=supabaseEnabled?window.supabase.createClient(cfg.url,cfg.anonKey):null;

const needGrid=document.getElementById('needGrid'),offerGrid=document.getElementById('offerGrid');
function renderNeeds(list=needs){needGrid.innerHTML=list.map(x=>`<article class="request-card" data-id="${x.id}"><header><div><span class="tag pink">أحتاج مساعدة</span><h3>${escapeHtml(x.title)}</h3></div><button class="icon-btn save-btn" aria-label="حفظ">♡</button></header><p>${escapeHtml(x.desc)}</p><div class="meta"><span>📍 ${escapeHtml(x.city||'غير محدد')}</span><span>🕒 ${escapeHtml(x.time||'الآن')}</span><span>🏷️ ${escapeHtml(x.cat)}</span></div><button class="text-link contact-request">أقدر أساعد في هذا الطلب ←</button></article>`).join('');}
function renderOffers(list=offers){offerGrid.innerHTML=list.map(x=>`<article class="person-card" data-id="${x.id}"><div class="avatar">${escapeHtml((x.name||'م')[0])}</div><h3>${escapeHtml(x.name||'عضو من بينا')}</h3><p>${escapeHtml(x.skill)}</p><div class="rating">⭐ ${escapeHtml(x.rate||'جديد')}</div><div class="meta center"><span>📍 ${escapeHtml(x.city||'غير محدد')}</span><span>متاح للمساعدة</span></div><button class="btn soft mini contact-offer">تواصل</button></article>`).join('');}

async function hydrateFromSupabase(){
 if(!sb){renderNeeds();renderOffers();return;}
 const [reqRes,offRes]=await Promise.all([
   sb.from('requests').select('id,title,description,category,city,created_at,user_id,profiles(full_name)').eq('status','نشط').order('created_at',{ascending:false}),
   sb.from('offers').select('id,title,description,category,city,created_at,user_id,profiles(full_name)').eq('status','نشط').order('created_at',{ascending:false})
 ]);
 if(reqRes.error||offRes.error){console.warn(reqRes.error||offRes.error);showToast('تعذر تحميل البيانات السحابية؛ تم تشغيل النسخة المحلية');renderNeeds();renderOffers();return;}
 needs=(reqRes.data||[]).map(x=>({id:x.id,title:x.title,desc:x.description,cat:x.category,city:x.city,time:relativeTime(x.created_at),userId:x.user_id}));
 offers=(offRes.data||[]).map(x=>({id:x.id,name:x.profiles?.full_name||'عضو من بينا',skill:x.title,desc:x.description,cat:x.category,city:x.city,rate:'جديد',userId:x.user_id}));
 renderNeeds();renderOffers();
}

const search=document.getElementById('searchNeed'),cat=document.getElementById('needCategory');
function filterNeeds(){const q=search.value.trim();const c=cat.value;renderNeeds(needs.filter(x=>(!q||x.title.includes(q)||x.desc.includes(q))&&(c==='all'||x.cat===c)));}
search.addEventListener('input',filterNeeds);cat.addEventListener('change',filterNeeds);
document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>document.querySelector(b.dataset.scroll).scrollIntoView({behavior:'smooth'}));

const modal=document.getElementById('modal'),title=document.getElementById('modalTitle'),text=document.getElementById('modalText'),fields=document.getElementById('modalFields'),submitBtn=modal.querySelector('.modal-submit');
let currentModal=null;
const categories=['تعليم وتدريب','ترجمة وكتابة','تقنية وبرمجة','تصميم','إدارة وتنظيم','استشارات ومهارات','أعمال يدوية','أخرى'];
const cities=['المدينة المنورة','الرياض','جدة','الدمام','مكة','أخرى'];
function options(arr,label){return `<option value="">${label}</option>${arr.map(x=>`<option>${x}</option>`).join('')}`}
const configs={
 signup:['إنشاء حساب','ابدأ حسابك في بينا.','<input name="name" placeholder="الاسم" required><input name="email" type="email" placeholder="البريد الإلكتروني" required><input name="password" type="password" minlength="6" placeholder="كلمة المرور (6 أحرف على الأقل)" required>'],
 login:['تسجيل الدخول','أهلًا برجعتك.','<input name="email" type="email" placeholder="البريد الإلكتروني" required><input name="password" type="password" placeholder="كلمة المرور" required>'],
 request:['إنشاء طلب مساعدة','اكتب طلبك بوضوح ليعرف الآخرون كيف يساعدونك.',`<input name="title" placeholder="عنوان الطلب" required><select name="cat" required>${options(categories,'اختر التصنيف')}</select><select name="city" required>${options(cities,'اختر المدينة')}</select><textarea name="desc" placeholder="صف احتياجك..." required></textarea>`],
 offer:['إضافة عرض مساعدة','ما الشيء الذي تستطيع تقديمه للمجتمع؟',`<input name="skill" placeholder="عنوان المساعدة التي تقدمها" required><select name="cat" required>${options(categories,'اختر التصنيف')}</select><select name="city" required>${options(cities,'اختر المدينة')}</select><textarea name="desc" placeholder="تفاصيل مختصرة" required></textarea>`],
 message:['إرسال رسالة','ابدأ تواصلًا محترمًا وواضحًا داخل بينا.','<textarea name="message" placeholder="اكتب رسالتك..." required></textarea>']
};
function openModal(type,context={}){currentModal={type,context};const c=configs[type];title.textContent=c[0];text.textContent=c[1];fields.innerHTML=c[2];submitBtn.textContent=type==='request'?'نشر الطلب':type==='offer'?'نشر العرض':type==='message'?'إرسال':'متابعة';modal.showModal();}
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openModal(b.dataset.open));

async function requireAuth(){if(!supabaseEnabled)return true;if(currentUser)return true;showToast('سجلي الدخول أولًا لإتمام هذه الخطوة');openModal('login');return false;}
async function submitPost(fd,type){
 if(!(await requireAuth())) return false;
 const titleVal=type==='need'?fd.get('title'):fd.get('skill');
 const payload={title:titleVal,description:fd.get('desc'),category:fd.get('cat'),city:fd.get('city')};
 if(sb){
   const table=type==='need'?'requests':'offers';
   const {error}=await sb.from(table).insert({...payload,user_id:currentUser.id,status:'نشط'});
   if(error){showToast('لم يتم النشر: '+error.message);return false;}
   await hydrateFromSupabase();
 }else{
   if(type==='need'){needs.unshift({id:crypto.randomUUID(),title:titleVal,cat:payload.category,city:payload.city,desc:payload.description,time:'الآن'});save(STORAGE_KEYS.needs,needs);renderNeeds();}
   else {offers.unshift({id:crypto.randomUUID(),name:'عضو من بينا',skill:titleVal,cat:payload.category,city:payload.city,desc:payload.description,rate:'جديد'});save(STORAGE_KEYS.offers,offers);renderOffers();}
 }
 showToast(type==='need'?'تم نشر طلبك في بينا':'تم نشر عرض مساعدتك');
 document.querySelector(type==='need'?'#need':'#offer').scrollIntoView({behavior:'smooth'});
 return true;
}

modal.addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.target);let ok=true;
 if(currentModal.type==='request') ok=await submitPost(fd,'need');
 else if(currentModal.type==='offer') ok=await submitPost(fd,'offer');
 else if(currentModal.type==='signup'){
   if(sb){const {data,error}=await sb.auth.signUp({email:fd.get('email'),password:fd.get('password'),options:{emailRedirectTo:'https://banan369.github.io/bina/',data:{full_name:fd.get('name')}}});if(error){showToast(error.message);ok=false;}else{currentUser=data.user;showToast(data.session?'تم إنشاء الحساب وتسجيل الدخول':'تم إنشاء الحساب؛ تحققي من بريدك لتأكيده');}}
   else showToast('تم إنشاء حساب تجريبي محلي');
 }
 else if(currentModal.type==='login'){
   if(sb){const {data,error}=await sb.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error){showToast('تعذر الدخول: '+error.message);ok=false;}else{currentUser=data.user;showToast('تم تسجيل الدخول');updateAuthUI();}}
   else showToast('تم تسجيل الدخول تجريبيًا');
 }
 else if(currentModal.type==='message'){
   messages.push({id:Date.now(),from:'أنا',text:fd.get('message'),mine:true});save(STORAGE_KEYS.messages,messages);renderMessages();openMessages();showToast('تم إرسال الرسالة');
 }
 if(ok){modal.close();e.target.reset();updateAuthUI();}
});

function updateAuthUI(){
 document.querySelectorAll('[data-open="login"],[data-open="signup"]').forEach(b=>b.style.display=currentUser?'none':'');
 let logout=document.getElementById('logoutBtn');
 if(currentUser&&!logout){logout=document.createElement('button');logout.id='logoutBtn';logout.className='btn ghost';logout.textContent='تسجيل خروج';logout.onclick=async()=>{if(sb)await sb.auth.signOut();currentUser=null;updateAuthUI();showToast('تم تسجيل الخروج');};document.querySelector('.nav-actions').appendChild(logout);}
 if(!currentUser&&logout)logout.remove();
}

const messagesPanel=document.getElementById('messagesPanel'),messagesList=document.getElementById('messagesList');
function renderMessages(){messagesList.innerHTML=messages.map(m=>`<div class="bubble ${m.mine?'mine':''}"><small>${escapeHtml(m.from)}</small><p>${escapeHtml(m.text)}</p></div>`).join('');}
function openMessages(){messagesPanel.classList.add('open');messagesPanel.setAttribute('aria-hidden','false');}
function closeMessages(){messagesPanel.classList.remove('open');messagesPanel.setAttribute('aria-hidden','true');}
renderMessages();
document.querySelectorAll('[data-messages]').forEach(b=>b.addEventListener('click',openMessages));
document.querySelector('[data-close-messages]').addEventListener('click',closeMessages);
document.getElementById('quickMessageForm').addEventListener('submit',e=>{e.preventDefault();const input=e.target.elements.message;if(!input.value.trim())return;messages.push({id:Date.now(),from:'أنا',text:input.value.trim(),mine:true});save(STORAGE_KEYS.messages,messages);input.value='';renderMessages();});

document.addEventListener('click',e=>{const req=e.target.closest('.contact-request');const off=e.target.closest('.contact-offer');if(req){const card=req.closest('[data-id]');openModal('message',{kind:'request',id:card.dataset.id});}if(off){const card=off.closest('[data-id]');openModal('message',{kind:'offer',id:card.dataset.id});}if(e.target.closest('.save-btn')){e.target.closest('.save-btn').textContent='♥';showToast('تم الحفظ في المفضلة');}});
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);}
document.querySelector('.menu-toggle').onclick=()=>document.querySelector('.nav-links').classList.toggle('mobile-open');
document.querySelectorAll('.category-grid button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelector('#need').scrollIntoView({behavior:'smooth'});const label=btn.querySelector('span')?.textContent;if(label&&categories.includes(label)){cat.value=label;filterNeeds();}}));

(async function init(){
 if(sb){const {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;sb.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAuthUI();});}
 updateAuthUI();await hydrateFromSupabase();
 if(!supabaseEnabled) console.info('بينا يعمل الآن في الوضع المحلي. أضف بيانات Supabase إلى supabase-config.js لتفعيل الحسابات والبيانات الحقيقية.');
})();
