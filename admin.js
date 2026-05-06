/* ============================================================
   PARAMOUNT GADGETS — admin.js
   Standalone admin portal: login gate, analytics, orders,
   product management, inventory, PDF receipts
   ============================================================ */

const firebaseConfig = {
    apiKey:            "AIzaSyAbAV-urXC0tdtFRQkJExwo3eqDPYeEWP8",
    authDomain:        "paramountpaul123.firebaseapp.com",
    projectId:         "paramountpaul123",
    storageBucket:     "paramountpaul123.firebasestorage.app",
    messagingSenderId: "517605268130",
    appId:             "1:517605268130:web:526ae6ad71e914168a55fb"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

const OWNER_EMAIL  = "adeyemidavid986@gmail.com";
const IMGBB_KEY    = "51afda14f1e50e9187186e2c1a1d5286";
const CATEGORIES   = {
    phones:'📱 Phones', laptops:'💻 Laptops', tablets:'📟 Tablets',
    accessories:'🎧 Accessories', wearables:'⌚ Wearables',
    gaming:'🎮 Gaming', audio:'🔊 Audio'
};

let allProducts        = [];
let allOrders          = [];
let currentOrderFilter = 'pending';
let lastReceiptData    = null;

const FRIENDLY_ERRORS = {
    'auth/wrong-password':     'Incorrect password.',
    'auth/user-not-found':     'No account found with this email.',
    'auth/invalid-email':      'Please enter a valid email address.',
    'auth/too-many-requests':  'Too many attempts. Wait a moment.',
    'auth/invalid-credential': 'Incorrect email or password.',
};

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, type = 'info', duration = 3200) {
    const wrap = document.getElementById('toast-wrap');
    const icons = {
        success:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warning:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`,
        info:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>`
    };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="t-icon">${icons[type]}</span><span>${msg}</span>`;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-in'));
    setTimeout(() => {
        t.classList.remove('toast-in');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, duration);
}

function showConfirm(msg, okLabel = 'Confirm') {
    return new Promise(resolve => {
        let ov = document.getElementById('confirm-ov');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'confirm-ov';
            ov.className = 'confirm-overlay';
            ov.innerHTML = `<div class="confirm-box"><p id="c-msg"></p><div class="confirm-btns"><button id="c-cancel">Cancel</button><button id="c-ok"></button></div></div>`;
            document.body.appendChild(ov);
        }
        document.getElementById('c-msg').textContent = msg;
        document.getElementById('c-ok').textContent  = okLabel;
        ov.style.display = 'flex';
        document.getElementById('c-ok').onclick     = () => { ov.style.display='none'; resolve(true);  };
        document.getElementById('c-cancel').onclick = () => { ov.style.display='none'; resolve(false); };
    });
}

/* ============================================================
   AUTH GATE
   ============================================================ */
auth.onAuthStateChanged(user => {
    if (user && user.email === OWNER_EMAIL) {
        document.getElementById('login-gate').style.display   = 'none';
        document.getElementById('dashboard').style.display    = 'flex';
        document.getElementById('admin-email-display').textContent = user.email;
        startListeners();
    } else if (user) {
        // Logged in but not the owner — sign them out and show error
        auth.signOut();
        document.getElementById('gate-error').textContent = 'Access denied. This portal is owner-only.';
    } else {
        document.getElementById('login-gate').style.display  = 'flex';
        document.getElementById('dashboard').style.display   = 'none';
    }
});

async function adminLogin() {
    const email = document.getElementById('gate-email').value.trim();
    const pass  = document.getElementById('gate-pass').value;
    const errEl = document.getElementById('gate-error');
    errEl.textContent = '';
    if (!email || !pass) { errEl.textContent = 'Enter your email and password.'; return; }
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
        errEl.textContent = FRIENDLY_ERRORS[err.code] || 'Login failed. Try again.';
    }
}

// Allow Enter key on login form
document.getElementById('gate-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
});

function adminLogout() {
    auth.signOut().then(() => location.reload());
}

/* ============================================================
   DATA LISTENERS
   ============================================================ */
function startListeners() {
    db.collection('products').orderBy('timestamp','desc').onSnapshot(snap => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventory();
        updateAnalytics();
    });
    db.collection('orders').orderBy('date','desc').onSnapshot(snap => {
        allOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderOrders();
        updateAnalytics();
        // Update pending badge
        const pending = allOrders.filter(o => o.status === 'pending').length;
        const badge = document.getElementById('pending-badge');
        badge.textContent  = pending;
        badge.style.display = pending > 0 ? 'inline-flex' : 'none';
    });
}

/* ============================================================
   TABS
   ============================================================ */
function showTab(name, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${name}`).style.display = 'block';
    if (btn) btn.classList.add('active');
}

/* ============================================================
   ANALYTICS
   ============================================================ */
function updateAnalytics() {
    const revenue = allOrders.reduce((s,o) => s + (o.totalAmount||0), 0);
    const pending = allOrders.filter(o => o.status==='pending').length;

    document.getElementById('stat-revenue').textContent  = '₦' + revenue.toLocaleString();
    document.getElementById('stat-orders').textContent   = allOrders.length;
    document.getElementById('stat-pending').textContent  = pending;
    document.getElementById('stat-products').textContent = allProducts.length;

    // Best sellers
    const topMap = {};
    allOrders.forEach(o => (o.items||[]).forEach(i => {
        topMap[i.name] = (topMap[i.name]||0) + i.qty;
    }));
    const top5 = Object.entries(topMap).sort((a,b) => b[1]-a[1]).slice(0,5);
    document.getElementById('best-sellers').innerHTML = top5.length
        ? top5.map(([name,qty],i) => `
            <div class="top-row">
                <span class="top-rank">#${i+1}</span>
                <span class="top-name">${name}</span>
                <span class="top-qty">${qty} sold</span>
            </div>`).join('')
        : '<p class="muted">No orders yet.</p>';

    // Recent orders (last 5)
    document.getElementById('recent-orders').innerHTML = allOrders.slice(0,5).length
        ? allOrders.slice(0,5).map(o => {
            const date = safeDate(o.date);
            return `<div class="recent-row">
                <div>
                    <strong>${o.customerName}</strong>
                    <span class="muted"> · ${date.toLocaleDateString('en-NG')}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="status-pill status-${o.status}">${statusLabel(o.status)}</span>
                    <span class="gold-text">₦${o.totalAmount.toLocaleString()}</span>
                </div>
            </div>`;
          }).join('')
        : '<p class="muted">No orders yet.</p>';
}

/* ============================================================
   ORDERS
   ============================================================ */
function statusLabel(s) {
    return { pending:'⏳ Pending', shipped:'🚚 Shipped', delivered:'✅ Delivered' }[s] || s;
}
function statusNext(s) {
    return { pending:'shipped', shipped:'delivered' }[s] || null;
}
function safeDate(d) {
    if (d instanceof Date) return d;
    if (d && typeof d.toDate === 'function') return d.toDate();
    if (d && d.seconds) return new Date(d.seconds * 1000);
    return new Date();
}

function filterOrders(status, btn) {
    currentOrderFilter = status;
    document.querySelectorAll('.otab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderOrders();
}

function renderOrders() {
    const list = document.getElementById('orders-list');
    if (!list) return;
    const filtered = currentOrderFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === currentOrderFilter);

    if (!filtered.length) {
        list.innerHTML = `<p class="muted">No ${currentOrderFilter} orders.</p>`;
        return;
    }

    list.innerHTML = filtered.map(o => {
        const date = safeDate(o.date);
        const next = statusNext(o.status);
        return `
        <div class="order-card">
            <div class="order-top">
                <div>
                    <strong class="order-name">${o.customerName}</strong>
                    <span class="order-meta">${o.customerPhone}</span>
                </div>
                <span class="status-pill status-${o.status}">${statusLabel(o.status)}</span>
            </div>
            <p class="order-addr">📍 ${o.deliveryAddress}</p>
            <ul class="order-items">${(o.items||[]).map(i=>`<li>${i.name} × ${i.qty}</li>`).join('')}</ul>
            <div class="order-bottom">
                <span class="gold-text order-total">₦${o.totalAmount.toLocaleString()}</span>
                <span class="order-date">${date.toLocaleDateString('en-NG')}</span>
            </div>
            <div class="order-actions">
                ${next ? `<button class="btn-advance" onclick="advanceOrder('${o.id}','${next}')">
                    ${{shipped:'Mark Shipped 🚚', delivered:'Mark Delivered ✅'}[next]}
                </button>` : ''}
                <button class="btn-receipt" onclick="showReceipt(${JSON.stringify(o).replace(/"/g,'&quot;')})">🧾 Receipt</button>
                <button class="btn-delete" onclick="deleteOrder('${o.id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

async function advanceOrder(id, newStatus) {
    await db.collection('orders').doc(id).update({ status: newStatus });
    showToast(`Order marked as ${newStatus}`, 'success');
}

async function deleteOrder(id) {
    const ok = await showConfirm('Delete this order permanently?', 'Delete');
    if (ok) {
        await db.collection('orders').doc(id).delete();
        showToast('Order deleted', 'info');
    }
}

/* ============================================================
   PRODUCT FORM
   ============================================================ */
async function uploadToImgBB() {
    const file   = document.getElementById('image-file').files[0];
    const status = document.getElementById('upload-status');
    const preview = document.getElementById('img-preview');
    const previewWrap = document.getElementById('img-preview-wrap');
    const dropText = document.getElementById('file-drop-text');
    if (!file) return;

    // Show local preview immediately
    preview.src = URL.createObjectURL(file);
    previewWrap.style.display = 'block';
    dropText.textContent = file.name;

    status.textContent = 'Uploading image…';
    const fd = new FormData(); fd.append('image', file);
    try {
        const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`,{method:'POST',body:fd});
        const data = await res.json();
        if (data.success) {
            document.getElementById('new-image').value = data.data.url;
            status.textContent = '✓ Image ready';
            showToast('Image uploaded', 'success');
        } else throw new Error();
    } catch {
        status.textContent = '✗ Upload failed';
        showToast('Image upload failed — check connection', 'error');
    }
}

async function saveProduct() {
    const id = document.getElementById('edit-id').value;
    const payload = {
        name:        document.getElementById('new-name').value.trim(),
        category:    document.getElementById('new-category').value,
        price:       parseInt(document.getElementById('new-price').value) || 0,
        stock:       parseInt(document.getElementById('new-stock').value) || 0,
        description: document.getElementById('new-desc').value.trim(),
        image:       document.getElementById('new-image').value.trim(),
        timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!payload.name)  { showToast('Product name is required', 'warning'); return; }
    if (!payload.image) { showToast('Please upload an image first', 'warning'); return; }
    if (id) {
        await db.collection('products').doc(id).update(payload);
        showToast('Product updated ✓', 'success');
    } else {
        await db.collection('products').add(payload);
        showToast('Product added to store ✓', 'success');
    }
    resetForm();
    // Switch to inventory to see the result
    showTab('inventory', document.querySelector('.nav-item:nth-child(4)'));
}

function startEdit(id) {
    const p = allProducts.find(x => x.id === id);
    document.getElementById('edit-id').value          = p.id;
    document.getElementById('new-name').value         = p.name;
    document.getElementById('new-price').value        = p.price;
    document.getElementById('new-stock').value        = p.stock;
    document.getElementById('new-category').value     = p.category || 'phones';
    document.getElementById('new-image').value        = p.image;
    document.getElementById('new-desc').value         = p.description || '';
    document.getElementById('form-header').textContent = 'Edit Product';
    if (p.image) {
        document.getElementById('img-preview').src       = p.image;
        document.getElementById('img-preview-wrap').style.display = 'block';
    }
    showTab('products', document.querySelector('.nav-item:nth-child(3)'));
}

function resetForm() {
    ['edit-id','new-name','new-price','new-stock','new-image','new-desc']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('new-category').value          = 'phones';
    document.getElementById('form-header').textContent     = 'Add New Product';
    document.getElementById('upload-status').textContent   = '';
    document.getElementById('file-drop-text').textContent  = 'Click to upload or drag image here';
    document.getElementById('img-preview-wrap').style.display = 'none';
}

async function deleteProduct(id) {
    const ok = await showConfirm('Delete this product? This cannot be undone.', 'Delete');
    if (ok) {
        await db.collection('products').doc(id).delete();
        showToast('Product deleted', 'info');
    }
}

/* ============================================================
   INVENTORY
   ============================================================ */
function renderInventory() {
    const body = document.getElementById('inventory-body');
    if (!body) return;
    if (!allProducts.length) {
        body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px;">No products yet.</td></tr>';
        return;
    }
    body.innerHTML = allProducts.map(p => `
        <tr>
            <td>
                <div class="inv-product">
                    <img src="${p.image}" class="inv-thumb" alt="">
                    <span>${p.name}</span>
                </div>
            </td>
            <td>${CATEGORIES[p.category] || '📱 Phones'}</td>
            <td class="gold-text">₦${p.price.toLocaleString()}</td>
            <td>
                <span class="${p.stock <= 0 ? 'stock-zero' : p.stock <= 2 ? 'stock-low' : 'stock-ok'}">
                    ${p.stock <= 0 ? 'Out of stock' : p.stock}
                </span>
            </td>
            <td>
                <button class="tbl-edit" onclick="startEdit('${p.id}')">Edit</button>
                <button class="tbl-del"  onclick="deleteProduct('${p.id}')">Delete</button>
            </td>
        </tr>`).join('');
}

/* ============================================================
   RECEIPT
   ============================================================ */
function showReceipt(order) {
    if (typeof order === 'string') { try { order = JSON.parse(order); } catch(e) {} }
    lastReceiptData = order;
    const date = safeDate(order.date);
    const dateStr = date.toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' });

    document.getElementById('receipt-body').innerHTML = `
        <div class="receipt">
            <div class="receipt-logo">PARAMOUNT GADGETS</div>
            <p class="receipt-sub">Official Receipt</p>
            <div class="receipt-divider"></div>
            <div class="receipt-row"><span>Order Ref</span><span>${order.reference || order.id}</span></div>
            <div class="receipt-row"><span>Date</span><span>${dateStr}</span></div>
            <div class="receipt-row"><span>Customer</span><span>${order.customerName}</span></div>
            <div class="receipt-row"><span>Phone</span><span>${order.customerPhone}</span></div>
            <div class="receipt-row"><span>Delivery To</span><span>${order.deliveryAddress}</span></div>
            <div class="receipt-divider"></div>
            <p class="receipt-items-label">Items Ordered</p>
            ${(order.items||[]).map(i=>`
            <div class="receipt-item">
                <span>${i.name} ×${i.qty}</span>
                <span>₦${(i.price*i.qty).toLocaleString()}</span>
            </div>`).join('')}
            <div class="receipt-divider"></div>
            <div class="receipt-total">
                <span>TOTAL PAID</span>
                <span>₦${order.totalAmount.toLocaleString()}</span>
            </div>
            <p class="receipt-thanks">Thank you for shopping with us!</p>
        </div>`;
    document.getElementById('receipt-overlay').style.display = 'flex';
}

function closeReceipt() {
    document.getElementById('receipt-overlay').style.display = 'none';
}

function downloadReceiptPDF() {
    if (!lastReceiptData) return;
    const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) { showToast('PDF library not loaded', 'error'); return; }
    const doc = new JsPDF({ unit:'mm', format:'a6' });
    const o   = lastReceiptData;
    const date = safeDate(o.date);
    const dateStr = date.toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});

    doc.setFontSize(14); doc.setFont('helvetica','bold');
    doc.text('PARAMOUNT GADGETS', 74, 14, { align:'center' });
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('Official Receipt', 74, 20, { align:'center' });
    doc.setDrawColor(200,168,76); doc.setLineWidth(0.4);
    doc.line(10, 24, 138, 24);

    let y = 30;
    const row = (label, val) => {
        doc.setFont('helvetica','bold');   doc.text(label+':', 10, y);
        doc.setFont('helvetica','normal'); doc.text(String(val), 138, y, {align:'right'});
        y += 6;
    };
    row('Ref',    o.reference || o.id);
    row('Date',   dateStr);
    row('Name',   o.customerName);
    row('Phone',  o.customerPhone);
    row('Addr',   o.deliveryAddress);
    doc.line(10,y,138,y); y+=6;
    doc.setFont('helvetica','bold'); doc.text('Items:', 10, y); y+=6;
    (o.items||[]).forEach(i => {
        doc.setFont('helvetica','normal');
        doc.text(`${i.name} x${i.qty}`, 12, y);
        doc.text(`N${(i.price*i.qty).toLocaleString()}`, 138, y, {align:'right'});
        y+=6;
    });
    doc.line(10,y,138,y); y+=6;
    doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text('TOTAL PAID:', 10, y);
    doc.text(`N${o.totalAmount.toLocaleString()}`, 138, y, {align:'right'});
    y+=10;
    doc.setFont('helvetica','italic'); doc.setFontSize(8);
    doc.text('Thank you for shopping with Paramount Gadgets!', 74, y, {align:'center'});
    doc.save(`Receipt_${o.reference||o.id}.pdf`);
    showToast('Receipt downloaded!', 'success');
}


