// IMPORTANT: You must have an index.html file that defines the element IDs used in this script.
// This script also requires Firebase SDKs to be available.

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, setDoc, query, where, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyA3dt0c_ss2nTcVIjh-m861YIS_cV6qOsI",
  authDomain: "mapd-81a18.firebaseapp.com",
  projectId: "mapd-81a18",
  storageBucket: "mapd-81a18.firebasestorage.app",
  messagingSenderId: "408721995452",
  appId: "1:408721995452:web:069cec020a2936759942b9",
  measurementId: "G-11S1KJ5P07"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'stakeholder-map-mvp-local';
const __initial_auth_token_string = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- App State ---
let app, auth, db;
let userId = null;
let currentDealId = null;
let unsubscribeDeals, unsubscribeContacts, unsubscribeClusters, unsubscribeLinks;
let allContacts = [], allClusters = [], allLinks = [];
let isConnecting = false;
let sourceNodeForLink = null;
let selectedContactId = null;

const allTags = ['Champion', 'Economic Buyer', 'Detractor', 'Supporter', 'Legal Contact', 'IT Contact', 'Security Contact', 'End User'];

// --- DOM Elements ---
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const authToggleButton = document.getElementById('auth-toggle-button');
const logoutButton = document.getElementById('logout-button');
const dealsList = document.getElementById('deals-list');
const addDealBtn = document.getElementById('add-deal-btn');
const dealModal = document.getElementById('deal-modal');
const dealForm = document.getElementById('deal-form');
const cancelDealBtn = document.getElementById('cancel-deal-btn');
const dealView = document.getElementById('deal-view');
const welcomeView = document.getElementById('welcome-view');
const mapCanvas = document.getElementById('map-canvas');
const lineCanvas = document.getElementById('line-canvas');
const addContactMapBtn = document.getElementById('add-contact-map-btn');
const contactModal = document.getElementById('contact-modal');
const contactForm = document.getElementById('contact-form');
const cancelContactBtn = document.getElementById('cancel-contact-btn');
const addClusterBtn = document.getElementById('add-cluster-btn');

// --- Initialization ---
function initializeFirebase() {
    if (!firebaseConfig || !firebaseConfig.apiKey) {
         authError.textContent = "Application is not configured correctly.";
         return;
    }
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setupAuthListener();
}

// --- Authentication ---
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            document.getElementById('user-id-display').textContent = `User ID: ${userId}`;
            showAppScreen();
            fetchDeals();
        } else {
            if (__initial_auth_token_string) {
                try { await signInWithCustomToken(auth, __initial_auth_token_string); }
                catch (error) { await signInAnonymously(auth); }
            } else {
                await signInAnonymously(auth).catch(err => console.error("Anonymous sign in failed", err));
            }
        }
    });
}

authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, password).catch(error => {
        authError.textContent = `Error: ${error.message}`;
        authError.classList.remove('hidden');
    });
});

logoutButton.addEventListener('click', () => signOut(auth).then(showAuthScreen));

// --- UI Control ---
function showAuthScreen() {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    if (unsubscribeDeals) unsubscribeDeals();
    if (unsubscribeContacts) unsubscribeContacts();
    if (unsubscribeClusters) unsubscribeClusters();
    if (unsubscribeLinks) unsubscribeLinks();
    userId = null;
    currentDealId = null;
}

function showAppScreen() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    authError.classList.add('hidden');
}

// --- Deals Logic ---
function fetchDeals() {
    if (!userId) return;
    if (unsubscribeDeals) unsubscribeDeals();
    const dealsQuery = query(collection(db, `artifacts/${appId}/users/${userId}/deals`));
    unsubscribeDeals = onSnapshot(dealsQuery, (snapshot) => {
        const deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDeals(deals);
    });
}

function renderDeals(deals) {
    dealsList.innerHTML = '';
    deals.forEach(deal => {
        const dealEl = document.createElement('div');
        dealEl.className = `deal-item group p-3 rounded-md cursor-pointer mb-2 flex justify-between items-center ${deal.id === currentDealId ? 'bg-sky-100 text-sky-800' : 'hover:bg-slate-100'}`;
        dealEl.dataset.id = deal.id;

        const dealInfo = document.createElement('div');
        dealInfo.innerHTML = `<h4 class="font-semibold">${deal.companyName}</h4><p class="text-sm">${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.dealSize)}</p>`;
        
        const dealActions = document.createElement('div');
        dealActions.className = 'opacity-0 group-hover:opacity-100 transition-opacity flex items-center';
        
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '✏️';
        editBtn.className = 'p-1 hover:bg-slate-200 rounded';
        editBtn.title = 'Edit Deal';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDealModal(deal);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '❌';
        deleteBtn.className = 'p-1 hover:bg-slate-200 rounded';
        deleteBtn.title = 'Delete Deal';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDeal(deal.id);
        });

        dealActions.appendChild(editBtn);
        dealActions.appendChild(deleteBtn);

        const mainClickArea = document.createElement('div');
        mainClickArea.className = 'flex-grow';
        mainClickArea.appendChild(dealInfo);
        mainClickArea.addEventListener('click', () => selectDeal(deal));

        dealEl.appendChild(mainClickArea);
        dealEl.appendChild(dealActions);
        dealsList.appendChild(dealEl);
    });
}

async function deleteDeal(dealId) {
    if (!window.confirm('Are you sure you want to delete this deal and all its associated data? This cannot be undone.')) {
        return;
    }

    try {
        const basePath = `artifacts/${appId}/users/${userId}/deals/${dealId}`;
        for (const sub of ['contacts', 'clusters', 'links']) {
            const subSnapshot = await getDocs(collection(db, `${basePath}/${sub}`));
            await Promise.all(subSnapshot.docs.map(d => deleteDoc(d.ref)));
        }

        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/deals`, dealId));

        if (currentDealId === dealId) {
            currentDealId = null;
            dealView.classList.add('hidden');
            welcomeView.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error deleting deal: ", error);
        alert("There was an error deleting the deal.");
    }
}


function selectDeal(deal) {
    // 1. Set the new currentDealId
    currentDealId = deal.id;

    // 2. Display the details for the selected deal
    welcomeView.classList.add('hidden');
    dealView.classList.remove('hidden');
    document.getElementById('deal-company-name').textContent = deal.companyName;
    document.getElementById('deal-details-size').textContent = `Deal Size: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.dealSize)}`;
    document.getElementById('deal-details-date').textContent = `Close Date: ${deal.closeDate}`;
    
    // 3. Fetch the contacts for the deal
    fetchContactsAndClusters(currentDealId);
    
    // 4. Manually update the highlighting on the deals list
    // This avoids re-rendering and losing data.
    Array.from(dealsList.querySelectorAll('.deal-item')).forEach(el => {
        if (el.dataset.id === currentDealId) {
            el.classList.add('bg-sky-100', 'text-sky-800');
            el.classList.remove('hover:bg-slate-100');
        } else {
            el.classList.remove('bg-sky-100', 'text-sky-800');
            el.classList.add('hover:bg-slate-100');
        }
    });
}


function openDealModal(deal = null) {
    dealForm.reset();
    const modalTitle = document.getElementById('deal-modal-title');
    const dealIdInput = document.getElementById('deal-id');

    if (deal) {
        modalTitle.textContent = 'Edit Deal';
        dealIdInput.value = deal.id;
        document.getElementById('company-name').value = deal.companyName;
        document.getElementById('deal-size').value = deal.dealSize;
        document.getElementById('close-date').value = deal.closeDate;
    } else {
        modalTitle.textContent = 'Create a New Deal';
        dealIdInput.value = '';
    }
    dealModal.classList.add('flex');
    dealModal.classList.remove('hidden');
}


addDealBtn.addEventListener('click', () => openDealModal());
cancelDealBtn.addEventListener('click', () => { dealModal.classList.remove('flex'); dealModal.classList.add('hidden'); });

dealForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dealId = document.getElementById('deal-id').value;
    const dealData = {
        companyName: document.getElementById('company-name').value,
        dealSize: parseFloat(document.getElementById('deal-size').value),
        closeDate: document.getElementById('close-date').value,
    };

    if (dealId) {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals`, dealId), dealData);
    } else {
        dealData.createdAt = new Date();
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/deals`), dealData);
    }

    dealForm.reset();
    document.getElementById('deal-id').value = '';
    dealModal.classList.remove('flex');
    dealModal.classList.add('hidden');
});

// --- Map & Elements Logic ---
function fetchContactsAndClusters(dealId) {
    if (!userId) return;
    ['unsubscribeContacts', 'unsubscribeClusters', 'unsubscribeLinks'].forEach(unsub => { if(window[unsub]) window[unsub](); });

    const basePath = `artifacts/${appId}/users/${userId}/deals/${dealId}`;
    unsubscribeContacts = onSnapshot(collection(db, `${basePath}/contacts`), snap => {
        allContacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMapElements();
    });
    unsubscribeClusters = onSnapshot(collection(db, `${basePath}/clusters`), snap => {
        allClusters = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMapElements();
    });
    unsubscribeLinks = onSnapshot(collection(db, `${basePath}/links`), snap => {
        allLinks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMapElements();
    });
}

function renderMapElements() {
    const canvasContactIds = new Set(Array.from(mapCanvas.querySelectorAll('.contact-bubble')).map(el => el.dataset.id));
    const dataContactIds = new Set(allContacts.map(c => c.id));

    // 1. Add new contacts or update existing ones
    allContacts.forEach(contact => {
        let contactEl = document.getElementById(`contact-${contact.id}`);

        if (!contactEl) {
            // This contact is new, so create and append it
            contactEl = createContactBubble(contact);
            mapCanvas.appendChild(contactEl);
        } else {
            // The contact already exists on the screen. Let's update it.
            // We'll avoid touching the position if the user is currently dragging it.
            if (!contactEl.classList.contains('dragging')) {
                contactEl.style.left = `${contact.position.x}px`;
                contactEl.style.top = `${contact.position.y}px`;
            }

            // Update size based on influence
            const influence = contact.influence || 3;
            const size = 60 + (influence * 20);
            contactEl.style.width = `${size}px`;
            contactEl.style.height = `${size}px`;
            
            // Update inner HTML content (name, role, tags)
            const scaleFactor = 1 + ((influence - 3) * 0.1);
            const nameSize = 14 * scaleFactor;
            const roleSize = 12 * scaleFactor;
            const tagSize = 11 * scaleFactor;
            let tagsHtml = (contact.tags || []).map(tag => 
                `<span style="font-size: ${tagSize}px;" class="inline-block bg-yellow-200 text-yellow-800 font-semibold mr-1 px-2 py-0.5 rounded-full">${tag}</span>`
            ).join('');
            
            contactEl.querySelector('.font-bold').style.fontSize = `${nameSize}px`;
            contactEl.querySelector('.font-bold').textContent = `${contact.firstName} ${contact.lastName}`;
            contactEl.querySelector('.text-slate-600').style.fontSize = `${roleSize}px`;
            contactEl.querySelector('.text-slate-600').textContent = contact.role;
            contactEl.querySelector('.text-center').innerHTML = tagsHtml;
        }
    });

    // 2. Remove contacts that are on the canvas but no longer in the data
    canvasContactIds.forEach(id => {
        if (!dataContactIds.has(id)) {
            const elToRemove = document.getElementById(`contact-${id}`);
            if (elToRemove) {
                elToRemove.remove();
            }
        }
    });
    
    // (This same logic should be applied to clusters as well)
    // For now, we leave the cluster logic as-is to focus on the primary problem.
    mapCanvas.querySelectorAll('.cluster').forEach(el => el.remove());
    allClusters.forEach(cluster => mapCanvas.appendChild(createClusterElement(cluster)));


    // 3. Redraw the connection lines
    drawConnectionLines();
}

function createClusterElement(cluster) {
    const el = document.createElement('div');
    el.id = `cluster-${cluster.id}`;
    el.dataset.id = cluster.id;
    el.className = 'cluster absolute p-8 rounded-lg bg-slate-200 bg-opacity-50';
    const width = cluster.size?.width || 350;
    const height = cluster.size?.height || 200;
    el.style.cssText = `left:${cluster.position.x}px; top:${cluster.position.y}px; width:${width}px; height:${height}px;`;
    
    el.innerHTML = `
        <div class="cluster-name">${cluster.name}</div>
        <div class="cluster-actions">
            <button class="action-btn" data-action="rename-cluster" title="Rename Cluster">✏️</button>
            <button class="action-btn" data-action="delete-cluster" title="Delete Cluster">❌</button>
        </div>
        <div class="resize-handle se"></div><div class="resize-handle sw"></div>
        <div class="resize-handle ne"></div><div class="resize-handle nw"></div>
    `;

    el.addEventListener('mousedown', dragStartHandler);
    
    el.querySelectorAll('.resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', initResize);
    });

    return el;
}

function createContactBubble(contact) {
    const contactEl = document.createElement('div');
    contactEl.id = `contact-${contact.id}`;
    contactEl.dataset.id = contact.id;
    contactEl.className = 'contact-bubble absolute p-3 bg-white rounded-lg shadow-md';
    
    const influence = contact.influence || 3;
    const size = 60 + (influence * 20);
    contactEl.style.cssText = `left:${contact.position.x}px; top:${contact.position.y}px; width:${size}px; height:${size}px;`;

    const scaleFactor = 1 + ((influence - 3) * 0.1);
    const nameSize = 14 * scaleFactor;
    const roleSize = 12 * scaleFactor;
    const tagSize = 11 * scaleFactor;

    let tagsHtml = (contact.tags || []).map(tag => 
        `<span style="font-size: ${tagSize}px;" class="inline-block bg-yellow-200 text-yellow-800 font-semibold mr-1 px-2 py-0.5 rounded-full">${tag}</span>`
    ).join('');
    
    contactEl.innerHTML = `
        <div class="actions-top">
            <button class="action-btn" data-action="influence-down" title="Decrease Influence">▼</button>
            <button class="action-btn" data-action="toggle-tags" title="Assign Tags">⭐</button>
            <button class="action-btn" data-action="influence-up" title="Increase Influence">▲</button>
        </div>
        <div class="flex flex-col items-center justify-center h-full overflow-hidden">
            <div class="font-bold truncate w-full" style="font-size: ${nameSize}px;">${contact.firstName} ${contact.lastName}</div>
            <div class="text-slate-600 truncate w-full" style="font-size: ${roleSize}px;">${contact.role}</div>
            <div class="mt-1 w-full text-center">${tagsHtml}</div>
        </div>
        <div class="actions-bottom">
            <button class="action-btn" data-action="edit" title="Edit Contact">✏️</button>
            <button class="action-btn" data-action="connect" title="Connect to Manager">🔗</button>
            <button class="action-btn" data-action="delete" title="Delete Contact">❌</button>
        </div>
    `;

    contactEl.addEventListener('mousedown', dragStartHandler);
    return contactEl;
}

function handleActionClick(actionButton, element) {
    const action = actionButton.dataset.action;
    const id = element.dataset.id;

    if (element.classList.contains('contact-bubble')) {
        const contact = allContacts.find(c => c.id === id);
        switch (action) {
            case 'influence-up': updateInfluence(id, 1); break;
            case 'influence-down': updateInfluence(id, -1); break;
            case 'toggle-tags': showTagsDropdown(contact, actionButton); break;
            case 'edit': openContactModal(contact); break;
            case 'connect': initiateConnection(id); break;
            case 'delete': deleteContact(id); break;
        }
    } else if (element.classList.contains('cluster')) {
        switch (action) {
            case 'rename-cluster': renameCluster(id); break;
            case 'delete-cluster': deleteCluster(id); break;
        }
    }
}


async function renameCluster(clusterId) {
    const cluster = allClusters.find(c => c.id === clusterId);
    const newName = window.prompt("Enter new name for the cluster:", cluster.name);
    if (newName && newName.trim() !== '') {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/clusters`, clusterId), { name: newName });
    }
}

async function deleteCluster(clusterId) {
    if (window.confirm('Are you sure you want to delete this cluster? This cannot be undone.')) {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/clusters`, clusterId));
    }
}

async function updateInfluence(contactId, change) {
    const contact = allContacts.find(c => c.id === contactId);
    const currentInfluence = contact.influence || 3;
    const newInfluence = Math.max(1, Math.min(5, currentInfluence + change));
    await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId), { influence: newInfluence });
}

function showTagsDropdown(contact, button) {
    const existingDropdown = document.getElementById('tags-dropdown');
    if (existingDropdown) existingDropdown.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'tags-dropdown';
    dropdown.className = 'tags-dropdown';
    
    allTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = `tag-dropdown-item ${(contact.tags || []).includes(tag) ? 'selected' : ''}`;
        item.textContent = tag;
        item.dataset.tag = tag;
        item.onclick = () => toggleTag(contact.id, tag);
        dropdown.appendChild(item);
    });

    mapCanvas.appendChild(dropdown);
    const btnRect = button.getBoundingClientRect();
    const canvasRect = mapCanvas.getBoundingClientRect();
    dropdown.style.left = `${btnRect.left - canvasRect.left}px`;
    dropdown.style.top = `${btnRect.bottom - canvasRect.top + 5}px`;
}

async function deleteContact(contactId) {
    if (window.confirm('Are you sure you want to delete this contact?')) {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId));
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/links`), where('source', '==', contactId));
        const q2 = query(collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/links`), where('target', '==', contactId));
        (await getDocs(q)).docs.forEach(d => deleteDoc(d.ref));
        (await getDocs(q2)).docs.forEach(d => deleteDoc(d.ref));
    }
}

// --- Connection (Linking) Logic ---

function initiateConnection(contactId) {
    isConnecting = true;
    sourceNodeForLink = contactId;
    mapCanvas.classList.add('connecting-mode');
    deselectAll();
    const sourceNode = document.getElementById(`contact-${contactId}`);
    if(sourceNode) selectContact(sourceNode);
}

async function createConnection(targetId) {
    if (sourceNodeForLink && targetId && sourceNodeForLink !== targetId) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/links`), {
            source: sourceNodeForLink,
            target: targetId
        });
    }
    isConnecting = false;
    sourceNodeForLink = null;
    mapCanvas.classList.remove('connecting-mode');
    deselectAll();
}

function drawConnectionLines() {
    lineCanvas.innerHTML = lineCanvas.querySelector('defs')?.outerHTML || ''; // Keep defs
    allLinks.forEach(link => {
        const sourceNode = document.getElementById(`contact-${link.source}`);
        const targetNode = document.getElementById(`contact-${link.target}`);
        if (!sourceNode || !targetNode) return;

        const sourceRect = sourceNode.getBoundingClientRect();
        const targetRect = targetNode.getBoundingClientRect();
        const canvasRect = mapCanvas.getBoundingClientRect();
        
        const x1 = sourceRect.left - canvasRect.left + sourceRect.width / 2 + mapCanvas.scrollLeft;
        const y1 = sourceRect.top - canvasRect.top + sourceRect.height / 2 + mapCanvas.scrollTop;
        const x2 = targetRect.left - canvasRect.left + targetRect.width / 2 + mapCanvas.scrollLeft;
        const y2 = targetRect.top - canvasRect.top + targetRect.height / 2 + mapCanvas.scrollTop;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        lineCanvas.appendChild(line);
    });
}

// --- CORRECTED Drag and Selection Logic ---
// This block provides the functions needed for dragging and dropping elements.
const dragState = {
    isMouseDown: false,
    isDragging: false,
    node: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};

function dragStartHandler(e) {
    if (e.button !== 0 || e.target.closest('.resize-handle')) return;
    dragState.isMouseDown = true;
    dragState.node = e.currentTarget;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    const nodeRect = dragState.node.getBoundingClientRect();
    dragState.offsetX = e.clientX - nodeRect.left;
    dragState.offsetY = e.clientY - nodeRect.top;
    window.addEventListener('mousemove', dragMoveHandler);
    window.addEventListener('mouseup', dragEndHandler);
}

function dragMoveHandler(e) {
    if (!dragState.isMouseDown) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragState.isDragging) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            dragState.isDragging = true;
            dragState.node.classList.add('dragging');
            deselectAll();
        }
    }
    if (dragState.isDragging) {
        const canvasRect = mapCanvas.getBoundingClientRect();
        const x = e.clientX - canvasRect.left - dragState.offsetX + mapCanvas.scrollLeft;
        const y = e.clientY - canvasRect.top - dragState.offsetY + mapCanvas.scrollTop;
        dragState.node.style.left = `${x}px`;
        dragState.node.style.top = `${y}px`;
        drawConnectionLines();
    }
}

async function dragEndHandler(e) {
    if (!dragState.isMouseDown) return;
    window.removeEventListener('mousemove', dragMoveHandler);
    window.removeEventListener('mouseup', dragEndHandler);
    const node = dragState.node;
    const wasDragging = dragState.isDragging;
    dragState.isMouseDown = false;
    dragState.isDragging = false;
    dragState.node = null;
    if (wasDragging) {
        node.classList.remove('dragging');
        const newPos = {
            x: parseInt(node.style.left, 10),
            y: parseInt(node.style.top, 10)
        };
        const elementId = node.dataset.id;
        const collectionName = node.classList.contains('contact-bubble') ? 'contacts' : 'clusters';
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/${collectionName}`, elementId), { position: newPos });
        deselectAll();
    } else {
        const actionButton = e.target.closest('[data-action]');
        if (actionButton) {
            handleActionClick(actionButton, node);
        } else {
             if (node.classList.contains('contact-bubble')) {
                if (isConnecting) {
                    createConnection(node.dataset.id);
                } else {
                    selectContact(node);
                }
            } else if (node.classList.contains('cluster')) {
                selectCluster(node);
            }
        }
    }
}

// --- Cluster Resizing ---
let resizableEl = null;
let original_w, original_h, original_x, original_y, original_mouse_x, original_mouse_y;

function initResize(e) {
    e.preventDefault();
    e.stopPropagation();
    resizableEl = e.target.closest('.cluster');
    original_w = parseFloat(getComputedStyle(resizableEl, null).getPropertyValue('width').replace('px', ''));
    original_h = parseFloat(getComputedStyle(resizableEl, null).getPropertyValue('height').replace('px', ''));
    original_x = resizableEl.getBoundingClientRect().left;
    original_y = resizableEl.getBoundingClientRect().top;
    original_mouse_x = e.pageX;
    original_mouse_y = e.pageY;

    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResize);
}

function resize(e) {
    if (resizableEl) {
        const width = original_w + (e.pageX - original_mouse_x);
        const height = original_h + (e.pageY - original_mouse_y);
        if (width > 150) { resizableEl.style.width = width + 'px'; }
        if (height > 100) { resizableEl.style.height = height + 'px'; }
    }
}

async function stopResize() {
    window.removeEventListener('mousemove', resize);
    window.removeEventListener('mouseup', stopResize);
    if (resizableEl) {
        const newSize = {
            width: parseInt(resizableEl.style.width),
            height: parseInt(resizableEl.style.height)
        };
        const clusterId = resizableEl.dataset.id;
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/clusters`, clusterId), { size: newSize });
        resizableEl = null;
    }
}

function selectContact(contactEl) {
    const isAlreadySelected = contactEl.classList.contains('selected');
    deselectAll();
    if (!isAlreadySelected) {
        contactEl.classList.add('selected');
        selectedContactId = contactEl.dataset.id;
    }
}

function selectCluster(clusterEl) {
    const isAlreadySelected = clusterEl.classList.contains('selected');
    deselectAll();
    if (!isAlreadySelected) {
        clusterEl.classList.add('selected');
    }
}

function deselectAll(keepDropdown = false) {
    document.querySelectorAll('.contact-bubble.selected, .cluster.selected').forEach(el => el.classList.remove('selected'));
    selectedContactId = null;
    if (!keepDropdown) {
        const existingDropdown = document.getElementById('tags-dropdown');
        if (existingDropdown) existingDropdown.remove();
    }
}

mapCanvas.addEventListener('click', (e) => {
    if (e.target === mapCanvas) {
         if (isConnecting) {
            isConnecting = false;
            sourceNodeForLink = null;
            mapCanvas.classList.remove('connecting-mode');
        }
        deselectAll();
    }
});

// --- Modal & Form Logic ---

addContactMapBtn.addEventListener('click', () => openContactModal());

function openContactModal(contact = null) {
    contactForm.reset();
    document.getElementById('contact-id').value = '';
    if (contact) {
        document.getElementById('contact-modal-title').textContent = 'Edit Contact';
        document.getElementById('contact-id').value = contact.id;
        document.getElementById('contact-first-name').value = contact.firstName;
        document.getElementById('contact-last-name').value = contact.lastName;
        document.getElementById('contact-role').value = contact.role;
        document.getElementById('contact-location').value = contact.location;
        document.getElementById('contact-email').value = contact.email;
        document.getElementById('contact-phone').value = contact.phone;
        document.getElementById('contact-linkedin').value = contact.linkedin;
        document.getElementById('contact-crm').value = contact.crmLink;
    } else {
        document.getElementById('contact-modal-title').textContent = 'Add New Contact';
    }
    contactModal.classList.add('flex');
    contactModal.classList.remove('hidden');
}


contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId || !currentDealId) return;
    const contactId = document.getElementById('contact-id').value;
    const contactData = {
        firstName: document.getElementById('contact-first-name').value,
        lastName: document.getElementById('contact-last-name').value,
        role: document.getElementById('contact-role').value,
        location: document.getElementById('contact-location').value,
        email: document.getElementById('contact-email').value,
        phone: document.getElementById('contact-phone').value,
        linkedin: document.getElementById('contact-linkedin').value,
        crmLink: document.getElementById('contact-crm').value,
    };
    const contactsCollection = collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`);
    if (contactId) {
        await updateDoc(doc(contactsCollection, contactId), contactData);
    } else {
        const canvasRect = mapCanvas.getBoundingClientRect();
        contactData.position = { 
            x: mapCanvas.scrollLeft + canvasRect.width / 2 - 50, 
            y: mapCanvas.scrollTop + canvasRect.height / 2 - 50
        };
        contactData.tags = [];
        contactData.influence = 3;
        await addDoc(contactsCollection, contactData);
    }
    contactModal.classList.remove('flex');
    contactModal.classList.add('hidden');
});
cancelContactBtn.addEventListener('click', () => { contactModal.classList.remove('flex'); contactModal.classList.add('hidden'); });

async function toggleTag(contactId, tag) {
    const contact = allContacts.find(c => c.id === contactId);
    let currentTags = contact.tags || [];
    if (currentTags.includes(tag)) {
        currentTags = currentTags.filter(t => t !== tag);
    } else {
        currentTags.push(tag);
    }
    await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId), { tags: currentTags });

    const dropdown = document.getElementById('tags-dropdown');
    if (dropdown) dropdown.remove();
}

addClusterBtn.addEventListener('click', async () => {
    const clusterName = window.prompt("Enter a name for the new cluster:");
    if (clusterName) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/clusters`), {
            name: clusterName,
            position: { x: 50, y: 50 + (allClusters.length * 150) },
            size: { width: 350, height: 200 }
        });
    }
});

// --- App Entry Point ---
initializeFirebase();
