const cfg = window.BINA_SUPABASE || {};
const supabaseEnabled = Boolean(cfg.url && cfg.anonKey && window.supabase);
const sb = supabaseEnabled ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
let currentUser = null;
let currentProfile = null;
let posts = [];
let reviews = [];
let conversations = [];
let activeConversationId = null;
let activeDashboardTab = 'home';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
const formatDate = value => value ? new Intl.DateTimeFormat('ar-SA', {dateStyle:'medium'}).format(new Date(value)) : 'غير محدد';
function relativeTime(value) {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${Math.floor(hours / 24)} يوم`;
}
function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}
function errorMessage(error) {
  console.error(error);
  return error?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}
function emptyState(message, action = '') { return `<div class="empty-state"><p>${escapeHtml(message)}</p>${action}</div>`; }
function loading(target, message = 'جارٍ تحميل البيانات...') { target.innerHTML = `<div class="loading-state"><span class="spinner"></span>${message}</div>`; }
function profileName(profile, fallback = 'عضو من بينا') { return profile?.full_name?.trim() || fallback; }
function avatar(profile) {
  if (profile?.avatar_url) return `<img src="${escapeHtml(profile.avatar_url)}" alt="صورة ${escapeHtml(profileName(profile))}">`;
  return escapeHtml(profileName(profile)[0] || 'ب');
}

const categories = ['تعليم وتدريب','ترجمة وكتابة','تقنية وبرمجة','تصميم','إدارة وتنظيم','استشارات ومهارات','أعمال يدوية','أخرى'];
const cities = ['المدينة المنورة','الرياض','جدة','الدمام','مكة','أخرى'];
const options = (items, label, selected = '') => `<option value="">${label}</option>${items.map(item => `<option ${item === selected ? 'selected' : ''}>${item}</option>`).join('')}`;
const statusLabels = {active:'نشط', matched:'تم التوافق', completed:'مكتمل', closed:'مغلق'};

const needGrid = $('#needGrid');
const offerGrid = $('#offerGrid');
function postOwner(post) { return post.profile || null; }
function renderNeeds(list = posts.filter(post => post.post_type === 'need' && post.status !== 'closed')) {
  needGrid.innerHTML = list.length ? list.map(post => `<article class="request-card" data-id="${post.id}"><header><div><span class="tag pink">أحتاج مساعدة</span><h3>${escapeHtml(post.title)}</h3></div></header><p>${escapeHtml(post.description)}</p><div class="owner-line"><span class="avatar small">${avatar(postOwner(post))}</span><strong>${escapeHtml(profileName(postOwner(post)))}</strong></div><div class="meta"><span>📍 ${escapeHtml(post.city || 'غير محدد')}</span><span>🕒 ${relativeTime(post.created_at)}</span><span>🏷️ ${escapeHtml(post.category)}</span></div><button type="button" class="text-link view-post">فتح الطلب</button>${currentUser?.id !== post.user_id ? '<button type="button" class="text-link contact-request">أقدر أساعد في هذا الطلب ←</button>' : ''}</article>`).join('') : emptyState('لا توجد طلبات مساعدة منشورة حتى الآن.');
}
function renderOffers(list = posts.filter(post => post.post_type === 'offer' && post.status !== 'closed')) {
  offerGrid.innerHTML = list.length ? list.map(post => `<article class="person-card" data-id="${post.id}"><div class="avatar">${avatar(postOwner(post))}</div><h3>${escapeHtml(profileName(postOwner(post)))}</h3><strong>${escapeHtml(post.title)}</strong><p>${escapeHtml(post.description)}</p><div class="meta center"><span>📍 ${escapeHtml(post.city || 'غير محدد')}</span><span>🏷️ ${escapeHtml(post.category)}</span></div><button type="button" class="text-link view-post">عرض التفاصيل</button>${currentUser?.id !== post.user_id ? '<button type="button" class="btn soft mini contact-offer">تواصل</button>' : ''}</article>`).join('') : emptyState('لا توجد عروض مساعدة منشورة حتى الآن.');
}
async function fetchProfiles(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const {data, error} = await sb.from('profiles').select('id,full_name,city,bio,skills,avatar_url,created_at').in('id', unique);
  if (error) throw error;
  return new Map((data || []).map(profile => [profile.id, profile]));
}
async function hydratePublicPosts() {
  loading(needGrid); loading(offerGrid);
  if (!sb) {
    needGrid.innerHTML = emptyState('تعذر الاتصال بقاعدة البيانات.');
    offerGrid.innerHTML = emptyState('تعذر الاتصال بقاعدة البيانات.');
    return;
  }
  const {data, error} = await sb.from('posts').select('id,user_id,post_type,title,description,category,city,status,created_at,updated_at').neq('status','closed').order('created_at',{ascending:false});
  if (error) { showToast('تعذر تحميل المنشورات: ' + errorMessage(error), 'error'); needGrid.innerHTML = emptyState('تعذر تحميل الطلبات.'); offerGrid.innerHTML = emptyState('تعذر تحميل العروض.'); return; }
  try {
    const profiles = await fetchProfiles((data || []).map(post => post.user_id));
    posts = (data || []).filter(post => profiles.has(post.user_id)).map(post => ({...post, profile:profiles.get(post.user_id)}));
    renderNeeds(); renderOffers(); filterNeeds();
  } catch (error) { showToast('تعذر تحميل أسماء أصحاب المنشورات: ' + errorMessage(error), 'error'); }
}

const search = $('#searchNeed');
const categoryFilter = $('#needCategory');
function filterNeeds() {
  const query = search.value.trim();
  renderNeeds(posts.filter(post => post.post_type === 'need' && post.status !== 'closed' && (!query || post.title.includes(query) || post.description.includes(query)) && (categoryFilter.value === 'all' || post.category === categoryFilter.value)));
}
search.addEventListener('input', filterNeeds);
categoryFilter.addEventListener('change', filterNeeds);
$$('[data-scroll]').forEach(button => button.onclick = () => $(button.dataset.scroll).scrollIntoView({behavior:'smooth'}));

const modal = $('#modal');
const modalTitle = $('#modalTitle');
const modalText = $('#modalText');
const modalFields = $('#modalFields');
const modalSubmit = $('.modal-submit', modal);
let currentModal = null;
function postFields(post = {}, type = 'need') {
  return `<input name="title" value="${escapeHtml(post.title || '')}" placeholder="العنوان" required maxlength="120"><select name="category" required>${options(categories,'اختر التصنيف',post.category)}</select><select name="city">${options(cities,'اختر المدينة',post.city)}</select><select name="status"><option value="active" ${post.status === 'active' ? 'selected' : ''}>نشط</option><option value="matched" ${post.status === 'matched' ? 'selected' : ''}>تم التوافق</option><option value="completed" ${post.status === 'completed' ? 'selected' : ''}>مكتمل</option><option value="closed" ${post.status === 'closed' ? 'selected' : ''}>مغلق</option></select><textarea name="description" placeholder="${type === 'need' ? 'صف احتياجك' : 'تفاصيل المساعدة'}" required maxlength="2000">${escapeHtml(post.description || '')}</textarea>`;
}
function modalConfig(type, context = {}) {
  const post = context.post || {};
  const configs = {
    signup:['إنشاء حساب','ابدأ حسابك في بينا.','<input name="name" placeholder="الاسم" required maxlength="100"><input name="email" type="email" placeholder="البريد الإلكتروني" required><input name="password" type="password" minlength="6" placeholder="كلمة المرور (6 أحرف على الأقل)" required>','إنشاء الحساب'],
    login:['تسجيل الدخول','أهلًا برجعتك.','<input name="email" type="email" placeholder="البريد الإلكتروني" required><input name="password" type="password" placeholder="كلمة المرور" required>','تسجيل الدخول'],
    request:['إنشاء طلب مساعدة','اكتب طلبك بوضوح ليعرف الآخرون كيف يساعدونك.',postFields({},'need'),'نشر الطلب'],
    offer:['إضافة عرض مساعدة','ما الشيء الذي تستطيع تقديمه للمجتمع؟',postFields({},'offer'),'نشر العرض'],
    editPost:[post.post_type === 'need' ? 'تعديل الطلب' : 'تعديل العرض','حدّث المعلومات ثم احفظ التغييرات.',postFields(post,post.post_type),'حفظ التعديلات'],
    viewPost:[post.title,`نشره ${profileName(post.profile)} — ${formatDate(post.created_at)}`,`<div class="post-details"><p>${escapeHtml(post.description)}</p><div class="meta"><span>📍 ${escapeHtml(post.city || 'غير محدد')}</span><span>🏷️ ${escapeHtml(post.category)}</span><span>الحالة: ${escapeHtml(statusLabels[post.status] || post.status)}</span></div></div>`,'إغلاق']
  };
  return configs[type];
}
function openModal(type, context = {}) {
  const config = modalConfig(type, context);
  if (!config) return;
  currentModal = {type, context};
  [modalTitle.textContent, modalText.textContent, modalFields.innerHTML, modalSubmit.textContent] = config;
  modalSubmit.type = type === 'viewPost' ? 'button' : 'submit';
  modalSubmit.onclick = type === 'viewPost' ? () => modal.close() : null;
  if (!modal.open) modal.showModal();
  $('input, select, textarea', modalFields)?.focus();
}
$$('[data-open]').forEach(button => button.onclick = async () => { if (['request','offer'].includes(button.dataset.open) && !(await requireAuth())) return; openModal(button.dataset.open); });
$('[data-close-modal]').onclick = () => modal.close();
modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });

async function requireAuth() {
  if (!sb) { showToast('إعداد Supabase غير متاح حاليًا.', 'error'); return false; }
  if (currentUser) return true;
  showToast('سجّل الدخول أولًا لإتمام هذه الخطوة.', 'error');
  openModal('login');
  return false;
}
async function savePost(formData, postType, id = null) {
  if (!(await requireAuth())) return false;
  const payload = {user_id:currentUser.id, post_type:postType, title:String(formData.get('title')).trim(), description:String(formData.get('description')).trim(), category:formData.get('category'), city:formData.get('city') || null, status:formData.get('status') || 'active'};
  const query = id ? sb.from('posts').update(payload).eq('id', id).eq('user_id', currentUser.id) : sb.from('posts').insert(payload);
  const {error} = await query;
  if (error) { showToast('تعذر حفظ المنشور: ' + errorMessage(error), 'error'); return false; }
  showToast(id ? 'تم حفظ التعديلات بنجاح.' : postType === 'need' ? 'تم نشر طلبك بنجاح.' : 'تم نشر عرضك بنجاح.');
  await Promise.all([hydratePublicPosts(), loadDashboardData()]);
  return true;
}
modal.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(event.target);
  modalSubmit.disabled = true;
  let succeeded = false;
  try {
    if (currentModal.type === 'request') succeeded = await savePost(formData, 'need');
    if (currentModal.type === 'offer') succeeded = await savePost(formData, 'offer');
    if (currentModal.type === 'editPost') succeeded = await savePost(formData, currentModal.context.post.post_type, currentModal.context.post.id);
    if (currentModal.type === 'signup') {
      if (!sb) throw new Error('إعداد Supabase غير متاح.');
      const {data, error} = await sb.auth.signUp({email:formData.get('email'), password:formData.get('password'), options:{emailRedirectTo:new URL('./', location.href).href, data:{full_name:String(formData.get('name')).trim()}}});
      if (error) throw error;
      currentUser = data.user;
      showToast(data.session ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'تم إنشاء الحساب؛ تحقق من بريدك الإلكتروني لتأكيده.');
      succeeded = true;
    }
    if (currentModal.type === 'login') {
      if (!sb) throw new Error('إعداد Supabase غير متاح.');
      const {data, error} = await sb.auth.signInWithPassword({email:formData.get('email'), password:formData.get('password')});
      if (error) throw error;
      currentUser = data.user;
      await refreshAccount();
      showToast('تم تسجيل الدخول بنجاح.');
      succeeded = true;
    }
  } catch (error) { showToast('تعذر إتمام العملية: ' + errorMessage(error), 'error'); }
  finally { modalSubmit.disabled = false; }
  if (succeeded) { modal.close(); event.target.reset(); updateAuthUI(); }
});

function updateAuthUI() {
  $$('[data-open="login"],[data-open="signup"]').forEach(button => button.hidden = Boolean(currentUser));
  let logout = $('#logoutBtn');
  if (currentUser && !logout) {
    logout = document.createElement('button'); logout.id = 'logoutBtn'; logout.className = 'btn ghost'; logout.textContent = 'تسجيل خروج';
    logout.onclick = async () => { await sb.auth.signOut(); currentUser = null; currentProfile = null; posts = []; reviews = []; conversations = []; updateAuthUI(); renderDashboard(); await hydratePublicPosts(); showToast('تم تسجيل الخروج.'); };
    $('.nav-actions').appendChild(logout);
  }
  if (!currentUser && logout) logout.remove();
  const mini = $('#profileMini');
  mini.innerHTML = currentUser ? `<div class="avatar">${avatar(currentProfile)}</div><strong>${escapeHtml(profileName(currentProfile, currentUser.email))}</strong><small>عضو منذ ${formatDate(currentProfile?.created_at || currentUser.created_at)}</small>` : '<div class="avatar">ب</div><strong>سجل الدخول</strong><small>للوصول إلى حسابك</small>';
}

async function refreshAccount() {
  if (!currentUser) { currentProfile = null; renderDashboard(); return; }
  const {data, error} = await sb.from('profiles').select('id,full_name,city,bio,skills,avatar_url,created_at').eq('id', currentUser.id).maybeSingle();
  if (error) showToast('تعذر تحميل الملف الشخصي: ' + errorMessage(error), 'error');
  currentProfile = data || {id:currentUser.id, full_name:currentUser.user_metadata?.full_name || 'عضو من بينا', created_at:currentUser.created_at};
  updateAuthUI();
  await loadDashboardData();
}
async function loadDashboardData() {
  if (!currentUser) { renderDashboard(); return; }
  loading($('#dashboardContent'), 'جارٍ تحميل بيانات حسابك...');
  const [postResult, reviewResult] = await Promise.all([
    sb.from('posts').select('id,user_id,post_type,title,description,category,city,status,created_at,updated_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
    sb.from('reviews').select('id,rating,comment,created_at,reviewer_id').eq('reviewed_user_id',currentUser.id).order('created_at',{ascending:false})
  ]);
  if (postResult.error || reviewResult.error) { showToast('تعذر تحميل لوحة التحكم: ' + errorMessage(postResult.error || reviewResult.error), 'error'); }
  posts = [...posts.filter(post => post.user_id !== currentUser.id), ...(postResult.data || []).map(post => ({...post,profile:currentProfile}))];
  reviews = reviewResult.data || [];
  if (reviews.length) {
    try { const profiles = await fetchProfiles(reviews.map(review => review.reviewer_id)); reviews = reviews.map(review => ({...review, reviewer:profiles.get(review.reviewer_id)})); } catch (error) { showToast('تعذر تحميل أسماء المقيّمين: ' + errorMessage(error), 'error'); }
  }
  renderDashboard();
}
function ownPosts(type) { return posts.filter(post => post.user_id === currentUser?.id && (!type || post.post_type === type)).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); }
function dashboardPostList(type) {
  const list = ownPosts(type);
  return list.length ? `<div class="dashboard-list">${list.map(post => `<article data-id="${post.id}"><div><span class="tag ${post.post_type === 'need' ? 'pink' : 'green'}">${post.post_type === 'need' ? 'طلب' : 'عرض'}</span><h4>${escapeHtml(post.title)}</h4><p>${escapeHtml(post.description)}</p><div class="meta"><span>${escapeHtml(post.category)}</span><span>${escapeHtml(statusLabels[post.status] || post.status)}</span><span>${formatDate(post.created_at)}</span></div></div><div class="item-actions"><button class="btn ghost mini view-post">فتح</button><button class="btn soft mini edit-own-post">تعديل</button><button class="btn danger mini delete-own-post">حذف</button></div></article>`).join('')}</div>` : emptyState(type === 'need' ? 'لم تنشر أي طلبات حتى الآن.' : 'لم تنشر أي عروض حتى الآن.', `<button class="btn primary" data-open="${type === 'need' ? 'request' : 'offer'}">+ إضافة ${type === 'need' ? 'طلب' : 'عرض'}</button>`);
}
function renderDashboard() {
  const content = $('#dashboardContent');
  $$('.dashboard-nav button').forEach(button => button.classList.toggle('active', button.dataset.dashboardTab === activeDashboardTab));
  if (!currentUser) { content.innerHTML = emptyState('سجّل الدخول لعرض بيانات لوحة التحكم الحقيقية.', '<button class="btn primary" data-open="login">تسجيل الدخول</button>'); bindDynamicActions(); return; }
  const mine = ownPosts();
  const completed = mine.filter(post => post.status === 'completed').length;
  const average = reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : '—';
  if (activeDashboardTab === 'home') {
    content.innerHTML = `<div class="stats"><div><b>${ownPosts('need').length}</b><span>طلباتي</span></div><div><b>${ownPosts('offer').length}</b><span>عروضي</span></div><div><b>${completed}</b><span>مساعدات مكتملة</span></div><div><b>${average}</b><span>التقييم</span></div></div><div class="panel"><h3>نشاطي الأخير</h3>${mine.length ? mine.slice(0,5).map(post => `<div class="activity" data-id="${post.id}"><span class="tag ${post.post_type === 'need' ? 'pink' : 'green'}">${post.post_type === 'need' ? 'أحتاج مساعدة' : 'أقدر أساعد'}</span><strong>${escapeHtml(post.title)}</strong><small>${relativeTime(post.updated_at || post.created_at)}</small></div>`).join('') : emptyState('لا يوجد نشاط حتى الآن.')}</div>`;
  } else if (activeDashboardTab === 'requests') content.innerHTML = `<div class="panel-head"><h3>طلباتي</h3><button class="btn primary" data-open="request">+ طلب جديد</button></div>${dashboardPostList('need')}`;
  else if (activeDashboardTab === 'offers') content.innerHTML = `<div class="panel-head"><h3>عروضي</h3><button class="btn soft" data-open="offer">+ عرض جديد</button></div>${dashboardPostList('offer')}`;
  else if (activeDashboardTab === 'reviews') content.innerHTML = `<div class="panel"><h3>التقييمات</h3>${reviews.length ? reviews.map(review => `<article class="review"><strong>${escapeHtml(profileName(review.reviewer))}</strong><span aria-label="${review.rating} من 5">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span><p>${escapeHtml(review.comment || 'بدون تعليق')}</p><small>${formatDate(review.created_at)}</small></article>`).join('') : emptyState('لا توجد تقييمات حتى الآن.')}</div>`;
  else if (activeDashboardTab === 'settings') content.innerHTML = `<form id="profileForm" class="panel settings-form"><h3>إعدادات الملف الشخصي</h3><label>الاسم<input name="full_name" required maxlength="100" value="${escapeHtml(currentProfile?.full_name || '')}"></label><label>البريد الإلكتروني<input value="${escapeHtml(currentUser.email || '')}" type="email" disabled><small>يُدار البريد الإلكتروني بأمان من خلال Supabase Auth.</small></label><label>نبذة عنك<textarea name="bio" maxlength="500">${escapeHtml(currentProfile?.bio || '')}</textarea></label><label>المدينة/المنطقة<select name="city">${options(cities,'اختر المدينة',currentProfile?.city)}</select></label><label>المهارات أو الأشياء التي تستطيع المساعدة فيها<textarea name="skills" maxlength="500">${escapeHtml(currentProfile?.skills || '')}</textarea></label><label>رابط الصورة الشخصية<input name="avatar_url" type="url" value="${escapeHtml(currentProfile?.avatar_url || '')}" placeholder="https://..."></label><p>تاريخ الانضمام: <strong>${formatDate(currentProfile?.created_at || currentUser.created_at)}</strong></p><button class="btn primary" type="submit">حفظ التغييرات</button></form>`;
  else if (activeDashboardTab === 'messages') { content.innerHTML = `<div class="panel"><h3>الرسائل</h3><p>تُعرض المحادثات المرتبطة بحسابك فقط.</p><button class="btn primary" data-messages>فتح الرسائل</button></div>`; }
  bindDynamicActions();
}
function bindDynamicActions() {
  $$('[data-open]', $('#dashboard')).forEach(button => button.onclick = () => openModal(button.dataset.open));
  $$('[data-messages]', $('#dashboard')).forEach(button => button.onclick = openMessages);
  const form = $('#profileForm');
  if (form) form.onsubmit = saveProfile;
}
async function saveProfile(event) {
  event.preventDefault();
  const button = $('button[type="submit"]', event.target); button.disabled = true;
  const formData = new FormData(event.target);
  const payload = {id:currentUser.id, full_name:String(formData.get('full_name')).trim(), bio:String(formData.get('bio')).trim() || null, city:formData.get('city') || null, skills:String(formData.get('skills')).trim() || null, avatar_url:String(formData.get('avatar_url')).trim() || null};
  const {data, error} = await sb.from('profiles').upsert(payload).select().single();
  button.disabled = false;
  if (error) return showToast('تعذر حفظ الملف الشخصي: ' + errorMessage(error), 'error');
  currentProfile = data; showToast('تم حفظ الملف الشخصي بنجاح.'); updateAuthUI(); await hydratePublicPosts(); renderDashboard();
}

const messagesPanel = $('#messagesPanel');
const conversationList = $('#conversationList');
const messagesList = $('#messagesList');
async function openMessages() {
  if (!(await requireAuth())) return;
  messagesPanel.classList.add('open'); messagesPanel.setAttribute('aria-hidden','false');
  await loadConversations();
}
function closeMessages() { messagesPanel.classList.remove('open'); messagesPanel.setAttribute('aria-hidden','true'); }
async function loadConversations() {
  loading(conversationList, 'جارٍ تحميل المحادثات...'); messagesList.innerHTML = emptyState('اختر محادثة لعرض الرسائل.');
  const {data, error} = await sb.rpc('get_my_conversations');
  if (error) { conversationList.innerHTML = emptyState('تعذر تحميل المحادثات.'); showToast('تعذر تحميل المحادثات: ' + errorMessage(error), 'error'); return; }
  conversations = data || [];
  conversationList.innerHTML = conversations.length ? conversations.map(item => `<button data-conversation-id="${item.conversation_id}"><span class="avatar small">${escapeHtml((item.other_user_name || 'ب')[0])}</span><span><strong>${escapeHtml(item.other_user_name)}</strong><small>${escapeHtml(item.post_title || 'محادثة مباشرة')}</small></span></button>`).join('') : emptyState('لا توجد محادثات حتى الآن.');
  $$('[data-conversation-id]', conversationList).forEach(button => button.onclick = () => loadMessages(button.dataset.conversationId));
  if (activeConversationId && conversations.some(item => item.conversation_id === activeConversationId)) await loadMessages(activeConversationId);
}
async function loadMessages(conversationId) {
  activeConversationId = conversationId; loading(messagesList, 'جارٍ تحميل الرسائل...');
  $$('[data-conversation-id]', conversationList).forEach(button => button.classList.toggle('active', button.dataset.conversationId === conversationId));
  const {data, error} = await sb.from('messages').select('id,sender_id,body,created_at').eq('conversation_id',conversationId).order('created_at');
  if (error) { messagesList.innerHTML = emptyState('تعذر تحميل الرسائل.'); showToast('تعذر تحميل الرسائل: ' + errorMessage(error), 'error'); return; }
  const conversation = conversations.find(item => item.conversation_id === conversationId);
  messagesList.innerHTML = data?.length ? data.map(message => `<div class="bubble ${message.sender_id === currentUser.id ? 'mine' : ''}"><small>${message.sender_id === currentUser.id ? 'أنا' : escapeHtml(conversation?.other_user_name || 'عضو من بينا')}</small><p>${escapeHtml(message.body)}</p><time>${relativeTime(message.created_at)}</time></div>`).join('') : emptyState('لا توجد رسائل في هذه المحادثة.');
  messagesList.scrollTop = messagesList.scrollHeight;
}
async function startConversation(post) {
  if (!(await requireAuth())) return;
  if (post.user_id === currentUser.id) return showToast('هذا المنشور يخصك.', 'error');
  const {data, error} = await sb.rpc('start_conversation', {target_post_id:post.id});
  if (error) return showToast('تعذر بدء المحادثة: ' + errorMessage(error), 'error');
  activeConversationId = data; await openMessages();
}
$('#quickMessageForm').onsubmit = async event => {
  event.preventDefault();
  const input = event.target.elements.message;
  if (!activeConversationId) return showToast('اختر محادثة أولًا.', 'error');
  const body = input.value.trim(); if (!body) return;
  const {error} = await sb.from('messages').insert({conversation_id:activeConversationId,sender_id:currentUser.id,body});
  if (error) return showToast('تعذر إرسال الرسالة: ' + errorMessage(error), 'error');
  input.value = ''; await loadMessages(activeConversationId); showToast('تم إرسال الرسالة.');
};
$$('[data-messages]').forEach(button => button.addEventListener('click', openMessages));
$('[data-close-messages]').onclick = closeMessages;

$$('[data-dashboard-tab]').forEach(button => button.onclick = async () => { activeDashboardTab = button.dataset.dashboardTab; if (activeDashboardTab === 'messages') await openMessages(); renderDashboard(); });
document.addEventListener('click', async event => {
  const card = event.target.closest('[data-id]');
  const post = card ? posts.find(item => item.id === card.dataset.id) : null;
  if (event.target.closest('.view-post') && post) openModal('viewPost',{post});
  if ((event.target.closest('.contact-request') || event.target.closest('.contact-offer')) && post) await startConversation(post);
  if (event.target.closest('.edit-own-post') && post && post.user_id === currentUser?.id) openModal('editPost',{post});
  if (event.target.closest('.delete-own-post') && post && post.user_id === currentUser?.id) {
    if (!confirm(`هل أنت متأكد من حذف «${post.title}»؟ لا يمكن التراجع عن الحذف.`)) return;
    const {error} = await sb.from('posts').delete().eq('id',post.id).eq('user_id',currentUser.id);
    if (error) return showToast('تعذر حذف المنشور: ' + errorMessage(error), 'error');
    showToast('تم حذف المنشور بنجاح.'); await Promise.all([hydratePublicPosts(),loadDashboardData()]);
  }
});
$('.menu-toggle').onclick = () => $('.nav-links').classList.toggle('mobile-open');
$$('.category-grid button').forEach(button => button.onclick = () => { $('#need').scrollIntoView({behavior:'smooth'}); const label = $('span',button)?.textContent; if (categories.includes(label)) { categoryFilter.value = label; filterNeeds(); } });

(async function init() {
  if (!sb) { updateAuthUI(); renderDashboard(); await hydratePublicPosts(); showToast('تعذر تفعيل الاتصال بـ Supabase.', 'error'); return; }
  const {data:{session}, error} = await sb.auth.getSession();
  if (error) showToast('تعذر التحقق من جلسة الدخول: ' + errorMessage(error), 'error');
  currentUser = session?.user || null;
  sb.auth.onAuthStateChange((_event, sessionValue) => { currentUser = sessionValue?.user || null; setTimeout(() => { updateAuthUI(); refreshAccount(); },0); });
  updateAuthUI();
  await Promise.all([hydratePublicPosts(), refreshAccount()]);
})();
