/* ============================================================
   PARAMOUNT PHONES — script.js
   Clean rebuild: toasts, back-button, cart UX, admin UID lock
   ============================================================ */

const firebaseConfig = {
    apiKey: "AIzaSyAbAV-urXC0tdtFRQkJExwo3eqDPYeEWP8",
    authDomain: "paramountpaul123.firebaseapp.com",
    projectId: "paramountpaul123",
    storageBucket: "paramountpaul123.firebasestorage.app",
    messagingSenderId: "517605268130",
    appId: "1:517605268130:web:526ae6ad71e914168a55fb"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── CONFIG ── Replace these before going live ──
const OWNER_UID    = "REPLACE_WITH_YOUR_UID";   // Firebase UID, not email
const PAYSTACK_KEY = "pk_test_162ba6ca046d82c62b847013ea3230a862921046"; // swap to pk_live_...
const IMGBB_KEY    = "51afda14f1e50e9187186e2c1a1d5286";
const WHATSAPP_NUM = "2337088832722";            // e.g. 2348012345678

let cart        = JSON.parse(localStorage.getItem('paramount_cart')) || [];
let allProducts = [];
let isLoginMode = true;

/* ============================================================
   TOAST SYSTEM  — replaces every alert() / confirm()
   ============================================================ */
function showToast(msg, type = 'info', duration = 3200) {
    // type: success | error | warning | info
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'toast-wrap';
        document.body.appendChild(wrap);
    }
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
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

/* Styled confirm — returns Promise<boolean> */
function showConfirm(msg, okLabel = 'Confirm') {
    return new Promise(resolve => {
        let ov = document.getElementById('confirm-ov');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'confirm-ov';
            ov.innerHTML = `
                <div class="confirm-box">
                    <p id="c-msg"></p>
                    <div class="confirm-btns">
                        <button id="c-cancel">Cancel</button>
                        <button id="c-ok"></button>
                    </div>
                </div>`;
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
   MODAL STACK  — history API makes phone back-button work
   ============================================================ */
let _activeModal = null;

function openModal(id) {
    if (_activeModal) document.getElementById(_activeModal).style.display = 'none';
    document.getElementById(id).style.display = 'flex';
    _activeModal = id;
    history.pushState({ modal: id }, '');
}

function closeActiveModal() {
    if (_activeModal) {
        document.getElementById(_activeModal).style.display = 'none';
        _activeModal = null;
    }
    // pop the history entry we pushed
    if (history.state && history.state.modal) history.back();
}

// Phone back-button handler
window.addEventListener('popstate', e => {
    if (_activeModal) {
        document.getElementById(_activeModal).style.display = 'none';
        _activeModal = null;
    }
});

// Tap dark backdrop to close
document.addEventListener('click', e => {
    if (_activeModal && e.target.classList.contains('modal-overlay')) {
        closeActiveModal();
    }
});

/* ============================================================
   DATA SYNC
   ============================================================ */
function listenToData() {
    // Skeleton while loading
    document.getElementById('product-grid').innerHTML =
        Array(6).fill(`
            <div class="card skel-card">
                <div class="skel skel-img"></div>
                <div class="skel skel-line"></div>
                <div class="skel skel-price"></div>
            </div>`).join('');

    db.collection("products").orderBy("timestamp","desc").onSnapshot(snap => {
        allProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderShop(allProducts);
        renderAdminInventory();
    });
    db.collection("orders").orderBy("date","desc").onSnapshot(snap => renderAdminOrders(snap));
}

/* ============================================================
   SHOP RENDER
   ============================================================ */
function renderShop(data) {
    if (!data.length) {
        document.getElementById('product-grid').innerHTML =
            `<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px 0;">No products found.</p>`;
        return;
    }
    document.getElementById('product-grid').innerHTML = data.map(p => `
        <div class="card ${p.stock <= 0 ? 'card-soldout' : ''}" onclick="viewProduct('${p.id}')">
            ${p.stock <= 0 ? '<span class="sold-out-badge">SOLD OUT</span>' : ''}
            <img src="${p.image}" alt="${p.name}" loading="lazy">
            <h3>${p.name}</h3>
            <p class="price">&#8358;${(Number(p.price)||0).toLocaleString()}</p>
        </div>`).join('');
}

/* ============================================================
   PRODUCT DETAIL MODAL
   ============================================================ */
function viewProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    document.getElementById('modal-img').src   = p.image;
    document.getElementById('modal-name').textContent  = p.name;
    document.getElementById('modal-price').textContent = '₦' + p.price.toLocaleString();
    document.getElementById('modal-desc').textContent  = p.description || '';

    const stockEl = document.getElementById('modal-stock');
    const addBtn  = document.getElementById('modal-add-btn');
    const waBtn   = document.getElementById('whatsapp-btn');

    if (p.stock <= 0) {
        stockEl.textContent = 'Out of Stock';
        stockEl.style.color = '#ef4444';
        addBtn.textContent  = 'OUT OF STOCK';
        addBtn.disabled     = true;
        addBtn.classList.add('btn-disabled');
    } else {
        stockEl.textContent = `In Stock — ${p.stock} unit${p.stock > 1 ? 's' : ''} left`;
        stockEl.style.color = 'var(--green)';
        addBtn.textContent  = 'ADD TO CART';
        addBtn.disabled     = false;
        addBtn.classList.remove('btn-disabled');
        addBtn.onclick = () => { addToCart(p); closeActiveModal(); };
    }

    waBtn.href = `https://wa.me/${WHATSAPP_NUM}?text=Hi, I want to order: ${encodeURIComponent(p.name)}`;
    openModal('product-modal');
}

/* ============================================================
   CART
   ============================================================ */
function addToCart(p) {
    if (!auth.currentUser) { toggleAuthModal(); return; }
    const existing = cart.find(i => i.id === p.id);
    if (existing) {
        if (existing.qty >= p.stock) { showToast('Maximum available stock reached', 'warning'); return; }
        existing.qty++;
        showToast(`${p.name} — quantity updated`, 'success');
    } else {
        cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
        showToast(`${p.name} added to cart`, 'success');
    }
    saveCart();
}

function changeQty(index, delta) {
    const item    = cart[index];
    const product = allProducts.find(p => p.id === item.id);

    if (delta === 1) {
        if (item.qty >= product.stock) { showToast('No more stock for this item', 'warning'); return; }
        item.qty++;
    } else {
        item.qty--;
        if (item.qty <= 0) {
            const name = item.name;
            cart.splice(index, 1);
            saveCart();
            renderCart();
            showToast(`${name} removed`, 'info');
            return;
        }
    }
    saveCart();
    renderCart();
}

function saveCart() {
    localStorage.setItem('paramount_cart', JSON.stringify(cart));
    document.getElementById('cart-count').textContent =
        cart.reduce((s, i) => s + i.qty, 0);
}

function openCart() {
    // Reset checkout every time cart opens
    document.getElementById('checkout-section').style.display = 'none';
    document.getElementById('reveal-checkout-btn').style.display = 'none';
    document.getElementById('clear-cart-btn').style.display = 'none';
    renderCart();
    openModal('cart-modal');
}

function renderCart() {
    const container  = document.getElementById('cart-items');
    const revealBtn  = document.getElementById('reveal-checkout-btn');
    const clearBtn   = document.getElementById('clear-cart-btn');

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                    <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                <p>Your cart is empty</p>
            </div>`;
        revealBtn.style.display = 'none';
        clearBtn.style.display  = 'none';
        document.getElementById('total-price').textContent = '0';
        return;
    }

    let total = 0;
    container.innerHTML = cart.map((item, i) => {
        total += item.price * item.qty;
        const product  = allProducts.find(p => p.id === item.id);
        const maxStock = product ? product.stock : item.qty;
        return `
        <div class="cart-item-row">
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-price">&#8358;${item.price.toLocaleString()}</span>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty(${i},-1)">&#8722;</button>
                <span class="qty-num">${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${i},1)"
                    ${item.qty >= maxStock ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>+</button>
            </div>
        </div>`;
    }).join('');

    document.getElementById('total-price').textContent = total.toLocaleString();
    revealBtn.style.display = 'block';
    clearBtn.style.display  = 'block';
}

function clearCart() {
    showConfirm('Remove all items from your cart?', 'Clear Cart').then(ok => {
        if (!ok) return;
        cart = [];
        saveCart();
        renderCart();
        showToast('Cart cleared', 'info');
    });
}

function showCheckout() {
    document.getElementById('checkout-section').style.display = 'block';
    document.getElementById('reveal-checkout-btn').style.display = 'none';
}

/* ============================================================
   PAYMENT
   ============================================================ */
function payWithPaystack() {
    const name  = document.getElementById('custName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const addr  = document.getElementById('custAddress').value.trim();

    if (!name || !email || !phone || !addr) {
        showToast('Please fill in all delivery details', 'warning');
        return;
    }

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    PaystackPop.setup({
        key: PAYSTACK_KEY,
        email,
        amount: total * 100,
        currency: 'NGN',
        callback(response) {
            db.collection('orders').add({
                customerName: name,
                customerEmail: email,
                customerPhone: phone,
                deliveryAddress: addr,
                items: cart,
                totalAmount: total,
                reference: response.reference,
                status: 'pending',
                date: new Date()
            }).then(() => {
                cart.forEach(item =>
                    db.collection('products').doc(item.id).update({
                        stock: firebase.firestore.FieldValue.increment(-item.qty)
                    })
                );
                localStorage.removeItem('paramount_cart');
                closeActiveModal();
                showToast('Payment confirmed! Your order has been placed 🎉', 'success', 5000);
                setTimeout(() => location.reload(), 2500);
            });
        },
        onClose() {
            showToast('Payment cancelled — your cart is still saved', 'warning');
        }
    }).openIframe();
}

/* ============================================================
   ADMIN  — secured by UID, not email (harder to spoof)
   ============================================================ */
function isAdmin() {
    return auth.currentUser && auth.currentUser.uid === OWNER_UID;
}

function toggleAdmin() {
    if (!isAdmin()) return; // silently ignore non-admins
    const panel = document.getElementById('admin-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function renderAdminInventory() {
    const body = document.getElementById('admin-inventory-body');
    if (!body) return;
    body.innerHTML = allProducts.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.stock}</td>
            <td>
                <button onclick="startEdit('${p.id}')">Edit</button>
                <button class="del-btn" onclick="deleteProduct('${p.id}')">Delete</button>
            </td>
        </tr>`).join('');
}

async function deleteProduct(id) {
    const ok = await showConfirm('Delete this product? This cannot be undone.', 'Delete');
    if (ok) {
        await db.collection('products').doc(id).delete();
        showToast('Product deleted', 'info');
    }
}

function renderAdminOrders(snap) {
    const list = document.getElementById('admin-orders-list');
    if (!list) return;
    if (snap.empty) { list.innerHTML = "<p class='no-orders'>No pending orders.</p>"; return; }
    list.innerHTML = snap.docs.map(doc => {
        const o = doc.data();
        return `
        <div class="order-card">
            <div class="order-meta">
                <strong>${o.customerName}</strong>
                <span>${o.customerPhone}</span>
            </div>
            <p class="order-addr">${o.deliveryAddress}</p>
            <ul class="order-items">${o.items.map(i => `<li>${i.name} &times; ${i.qty}</li>`).join('')}</ul>
            <p class="order-total">Total: &#8358;${o.totalAmount.toLocaleString()}</p>
            <button class="dispatch-btn" onclick="dispatchOrder('${doc.id}')">Mark as Dispatched</button>
        </div>`;
    }).join('');
}

async function dispatchOrder(id) {
    const ok = await showConfirm('Mark this order as dispatched and remove it?', 'Dispatch');
    if (ok) {
        await db.collection('orders').doc(id).delete();
        showToast('Order dispatched', 'success');
    }
}

async function uploadToImgBB() {
    const file   = document.getElementById('image-file').files[0];
    const status = document.getElementById('upload-status');
    if (!file) return;
    status.textContent = 'Uploading image…';
    const fd = new FormData();
    fd.append('image', file);
    try {
        const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            document.getElementById('new-image').value = data.data.url;
            status.textContent = '✓ Image ready';
            showToast('Image uploaded', 'success');
        } else { throw new Error(); }
    } catch {
        status.textContent = 'Upload failed';
        showToast('Image upload failed', 'error');
    }
}

async function saveProduct() {
    const id = document.getElementById('edit-id').value;
    const payload = {
        name:        document.getElementById('new-name').value.trim(),
        price:       parseInt(document.getElementById('new-price').value) || 0,
        stock:       parseInt(document.getElementById('new-stock').value) || 0,
        description: document.getElementById('new-desc').value.trim(),
        image:       document.getElementById('new-image').value.trim(),
        timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!payload.name || !payload.image) { showToast('Name and image are required', 'warning'); return; }
    if (id) {
        await db.collection('products').doc(id).update(payload);
        showToast('Product updated', 'success');
    } else {
        await db.collection('products').add(payload);
        showToast('Product added to store', 'success');
    }
    resetAdminForm();
}

function startEdit(id) {
    const p = allProducts.find(x => x.id === id);
    document.getElementById('edit-id').value    = p.id;
    document.getElementById('new-name').value   = p.name;
    document.getElementById('new-price').value  = p.price;
    document.getElementById('new-stock').value  = p.stock;
    document.getElementById('new-image').value  = p.image;
    document.getElementById('new-desc').value   = p.description || '';
    document.getElementById('form-header').textContent = 'Edit Product';
    document.getElementById('admin-panel').scrollIntoView({ behavior: 'smooth' });
}

function resetAdminForm() {
    ['edit-id','new-name','new-price','new-stock','new-image','new-desc']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('form-header').textContent   = 'Add New Product';
    document.getElementById('upload-status').textContent = '';
}

/* ============================================================
   AUTH
   ============================================================ */
const FRIENDLY_ERRORS = {
    'auth/wrong-password':      'Incorrect password. Please try again.',
    'auth/user-not-found':      'No account found with this email.',
    'auth/email-already-in-use':'This email is already registered. Try logging in.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/too-many-requests':   'Too many attempts. Please wait and try again.',
    'auth/invalid-credential':  'Incorrect email or password.',
};

auth.onAuthStateChanged(user => {
    const display  = document.getElementById('user-display');
    const logoutEl = document.getElementById('logout-btn');
    if (user) {
        display.textContent  = user.email.split('@')[0].toUpperCase();
        logoutEl.style.display = 'inline-block';
    } else {
        display.textContent  = 'LOGIN';
        logoutEl.style.display = 'none';
    }
});

function handleLogout() {
    auth.signOut().then(() => {
        showToast('Logged out', 'info');
        setTimeout(() => location.reload(), 800);
    });
}

function toggleAuthModal() { openModal('auth-modal'); }

async function handleAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-password').value;
    if (!email || !pass) { showToast('Please enter your email and password', 'warning'); return; }
    try {
        isLoginMode
            ? await auth.signInWithEmailAndPassword(email, pass)
            : await auth.createUserWithEmailAndPassword(email, pass);
        closeActiveModal();
        showToast(isLoginMode ? 'Welcome back!' : 'Account created — welcome!', 'success');
    } catch (err) {
        showToast(FRIENDLY_ERRORS[err.code] || 'Something went wrong. Try again.', 'error', 5000);
    }
}

function switchAuth() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').textContent = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('auth-link').textContent  = isLoginMode ? 'Register New Account' : 'Already have an account?';
}

function forgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { showToast('Enter your email above first', 'warning'); return; }
    auth.sendPasswordResetEmail(email)
        .then(() => showToast('Reset email sent — check your inbox', 'success'))
        .catch(err => showToast(FRIENDLY_ERRORS[err.code] || err.message, 'error', 5000));
}

/* ============================================================
   SEARCH
   ============================================================ */
function searchPhones() {
    const term = document.getElementById('search').value.toLowerCase();
    renderShop(allProducts.filter(p => p.name.toLowerCase().includes(term)));
}

/* ============================================================
   INIT
   ============================================================ */
listenToData();
saveCart(); // restore badge count on page load
