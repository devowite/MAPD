// IMPORTANT: You must have an index.html file that defines the element IDs used in this script.
// This script also requires Firebase SDKs to be available.

// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// This ID is provided by the canvas environment. For local dev, you can use a default.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'stakeholder-map-mvp-local';
const __initial_auth_token_string = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- App State ---
let app, auth, db;
let userId = null;
let currentDealId = null;
let unsubscribeDeals = null;
let unsubscribeContacts = null;
let unsubscribeClusters = null;
let draggedElement = null;

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
const addContactMapBtn = document.getElementById('add-contact-map-btn');
const contactModal = document.getElementById('contact-modal');
const contactForm = document.getElementById('contact-form');
const cancelContactBtn = document.getElementById('cancel-contact-btn');
const taggingModal = document.getElementById('tagging-modal');
const closeTaggingBtn = document.getElementById('close-tagging-btn');
const tagsContainer = document.getElementById('tags-container');
const addClusterBtn = document.getElementById('add-cluster-btn');
const deleteContactBtn = document.getElementById('delete-contact-btn');
const editContactFromTagModalBtn = document.getElementById('edit-contact-from-tag-modal-btn');


// --- Initialization ---
function initializeFirebase() {
    // Check if Firebase config is provided. If not, show an error.
    if (Object.keys(firebaseConfig).length === 0) {
         console.error("Firebase config is missing. Please add it to the script.");
         authError.textContent = "Application is not configured. Please contact the administrator.";
         authError.classList.remove('hidden');
         return;
    }
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setupAuthListener();
}

// --- Authentication ---
// Sets up a listener that triggers whenever the user's login state changes.
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // If user is logged in, store their ID and show the main app.
            userId = user.uid;
            document.getElementById('user-id-display').textContent = `User ID: ${userId}`;
            showAppScreen();
            fetchDeals();
        } else {
            // If no user, handle different sign-in scenarios for the environment.
            if (__initial_auth_token_string) {
                try {
                    await signInWithCustomToken(auth, __initial_auth_token_string);
                } catch (error) {
                    console.error("Custom token sign-in failed, trying anonymous:", error);
                    await signInAnonymously(auth);
                }
            } else {
                await signInAnonymously(auth).catch(err => console.error("Anonymous sign in failed", err));
            }
        }
    });
}

// Handles the sign-up / sign-in form submission.
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const isSignUp = authToggleButton.textContent === 'Sign In';

    // Determines whether to create a new user or sign in an existing one.
    const action = isSignUp 
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password);

    action.catch(error => {
        authError.textContent = error.message;
        authError.classList.remove('hidden');
    });
});

// Toggles the auth form between "Sign In" and "Sign Up" modes.
authToggleButton.addEventListener('click', () => {
    const isSignIn = authToggleButton.textContent === 'Sign Up';
    document.getElementById('auth-title').textContent = isSignIn ? 'Sign in to your account' : 'Create a new account';
    document.getElementById('auth-button').textContent = isSignIn ? 'Sign In' : 'Sign Up';
    document.getElementById('auth-toggle-text').textContent = isSignIn ? "Don't have an account?" : "Already have an account?";
    authToggleButton.textContent = isSignIn ? 'Sign Up' : 'Sign In';
    authError.classList.add('hidden');
});

// Logs the user out.
logoutButton.addEventListener('click', () => {
    signOut(auth);
    showAuthScreen();
});


// --- UI Control ---
// Resets the UI to the authentication screen.
function showAuthScreen() {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    // Unsubscribe from real-time listeners to prevent memory leaks.
    if (unsubscribeDeals) unsubscribeDeals();
    if (unsubscribeContacts) unsubscribeContacts();
    if (unsubscribeClusters) unsubscribeClusters();
    // Clear all dynamic content.
    dealsList.innerHTML = '';
    mapCanvas.innerHTML = '';
    dealView.classList.add('hidden');
    welcomeView.classList.remove('hidden');
    userId = null;
    currentDealId = null;
    document.getElementById('user-id-display').textContent = '';
}

// Shows the main application screen after successful login.
function showAppScreen() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    authError.classList.add('hidden');
}

// --- Deals Logic ---
// Fetches all deals for the current user from Firestore in real-time.
function fetchDeals() {
    if (!userId) return;
    if (unsubscribeDeals) unsubscribeDeals(); // Prevent multiple listeners
    const dealsCollection = collection(db, `artifacts/${appId}/users/${userId}/deals`);
    unsubscribeDeals = onSnapshot(dealsCollection, (snapshot) => {
        const deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDeals(deals);
    });
}

// Renders the list of deals in the sidebar.
function renderDeals(deals) {
    dealsList.innerHTML = '';
    if (deals.length === 0) {
         dealsList.innerHTML = `<p class="text-center text-slate-500 p-4">No deals yet. Create one!</p>`;
    } else {
         deals.forEach(deal => {
            const dealEl = document.createElement('div');
            // Highlight the currently selected deal
            dealEl.className = `p-3 rounded-md cursor-pointer mb-2 ${deal.id === currentDealId ? 'bg-sky-100 text-sky-800' : 'hover:bg-slate-100'}`;
            dealEl.dataset.id = deal.id;
            dealEl.innerHTML = `
                <h4 class="font-semibold">${deal.companyName}</h4>
                <p class="text-sm">${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.dealSize)}</p>
            `;
            dealEl.addEventListener('click', () => selectDeal(deal));
            dealsList.appendChild(dealEl);
        });
    }
}

// Handles selecting a deal from the list.
function selectDeal(deal) {
    currentDealId = deal.id;
    welcomeView.classList.add('hidden');
    dealView.classList.remove('hidden');
    // Update header with deal info
    document.getElementById('deal-company-name').textContent = deal.companyName;
    document.getElementById('deal-details-size').textContent = `Deal Size: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(deal.dealSize)}`;
    document.getElementById('deal-details-date').textContent = `Close Date: ${deal.closeDate}`;

    // Fetch the contacts and clusters for this specific deal.
    fetchContactsAndClusters(currentDealId);
    // Re-render the deals list to update the highlighting.
    fetchDeals(); 
}

// --- Modal Controls for Deals ---
addDealBtn.addEventListener('click', () => { dealModal.classList.add('flex'); dealModal.classList.remove('hidden'); });
cancelDealBtn.addEventListener('click', () => { dealModal.classList.remove('flex'); dealModal.classList.add('hidden'); });
dealForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId) return;
    const deal = {
        companyName: document.getElementById('company-name').value,
        dealSize: parseFloat(document.getElementById('deal-size').value),
        closeDate: document.getElementById('close-date').value,
        createdAt: new Date(),
    };
    const dealsCollection = collection(db, `artifacts/${appId}/users/${userId}/deals`);
    await addDoc(dealsCollection, deal);
    dealForm.reset();
    dealModal.classList.remove('flex');
    dealModal.classList.add('hidden');
});

// --- Contacts & Clusters Logic ---
// Fetches all contacts and clusters for the currently selected deal.
function fetchContactsAndClusters(dealId) {
    if (!userId) return;
    if (unsubscribeContacts) unsubscribeContacts();
    if (unsubscribeClusters) unsubscribeClusters();

    let currentClusters = []; // Local cache of clusters

    // Listen for real-time updates to contacts
    const contactsCollection = collection(db, `artifacts/${appId}/users/${userId}/deals/${dealId}/contacts`);
    unsubscribeContacts = onSnapshot(contactsCollection, (snapshot) => {
        const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Re-render the map with fresh contact data, using the cached cluster data
        renderMapElements(contacts, currentClusters);
    });

    // Listen for real-time updates to clusters
    const clustersCollection = collection(db, `artifacts/${appId}/users/${userId}/deals/${dealId}/clusters`);
    unsubscribeClusters = onSnapshot(clustersCollection, (snapshot) => {
        currentClusters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // To re-render, we need the latest contacts as well. We'll query them once.
         const contactsQuery = query(collection(db, `artifacts/${appId}/users/${userId}/deals/${dealId}/contacts`));
         getDocs(contactsQuery).then(contactSnapshot => {
            const contacts = contactSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMapElements(contacts, currentClusters);
         });
    });
}

// Renders all elements (clusters and contacts) onto the map canvas.
function renderMapElements(contacts = [], clusters = []) {
    mapCanvas.innerHTML = ''; // Clear canvas before re-rendering
    
    // Render clusters first so they are in the background
    clusters.forEach(cluster => {
        const clusterEl = document.createElement('div');
        clusterEl.id = `cluster-${cluster.id}`;
        clusterEl.className = 'cluster absolute p-8 rounded-lg bg-slate-200 bg-opacity-50';
        clusterEl.style.left = `${cluster.position.x}px`;
        clusterEl.style.top = `${cluster.position.y}px`;
        clusterEl.style.width = '350px';
        clusterEl.style.minHeight = '200px';
        
        const clusterTitle = document.createElement('h3');
        clusterTitle.className = 'font-bold text-slate-600 absolute -top-6 left-2';
        clusterTitle.textContent = cluster.name;
        clusterEl.appendChild(clusterTitle);
        
        mapCanvas.appendChild(clusterEl);
    });

    // Then render contacts on top
    contacts.forEach(contact => {
        const contactEl = createContactBubble(contact);
        mapCanvas.appendChild(contactEl);
    });
}

// Creates the HTML element for a single contact bubble.
function createContactBubble(contact) {
    const contactEl = document.createElement('div');
    contactEl.id = `contact-${contact.id}`;
    contactEl.dataset.id = contact.id;
    contactEl.className = 'contact-bubble absolute p-3 bg-white rounded-lg shadow-md w-64';
    contactEl.style.left = `${contact.position.x}px`;
    contactEl.style.top = `${contact.position.y}px`;
    contactEl.draggable = true;
    
    let tagsHtml = (contact.tags || []).map(tag => `<span class="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">${tag}</span>`).join('');
    
    contactEl.innerHTML = `
        <div class="font-bold">${contact.firstName} ${contact.lastName}</div>
        <div class="text-sm text-slate-600">${contact.role}</div>
        <div class="mt-2 flex flex-wrap gap-1">${tagsHtml}</div>
    `;

    contactEl.addEventListener('dragstart', handleDragStart);
    contactEl.addEventListener('click', (e) => {
        // This check prevents the click event from firing after a drag action.
        if(e.detail > 0) openTaggingModal(contact);
    });
    return contactEl;
}

// --- Modal Controls for Contacts ---
addContactMapBtn.addEventListener('click', () => openContactModal());
cancelContactBtn.addEventListener('click', () => { contactModal.classList.remove('flex'); contactModal.classList.add('hidden'); });

function openContactModal(contact = null, position = null) {
    contactForm.reset();
    const contactIdInput = document.getElementById('contact-id');
    const modalTitle = document.getElementById('contact-modal-title');

    if (contact) {
        // If a contact object is passed, populate the form for editing.
        modalTitle.textContent = "Edit Contact";
        contactIdInput.value = contact.id;
        document.getElementById('contact-first-name').value = contact.firstName || '';
        document.getElementById('contact-last-name').value = contact.lastName || '';
        document.getElementById('contact-role').value = contact.role || '';
        document.getElementById('contact-location').value = contact.location || '';
        document.getElementById('contact-email').value = contact.email || '';
        document.getElementById('contact-phone').value = contact.phone || '';
        document.getElementById('contact-linkedin').value = contact.linkedin || '';
        document.getElementById('contact-crm').value = contact.crmLink || '';
    } else {
        // Otherwise, prepare the form for creating a new contact.
        modalTitle.textContent = "Add New Contact";
        contactIdInput.value = '';
    }

    // Set a default random position for new contacts.
    contactForm.dataset.positionX = position ? position.x : Math.round(10 + Math.random() * 400);
    contactForm.dataset.positionY = position ? position.y : Math.round(10 + Math.random() * 300);

    contactModal.classList.add('flex');
    contactModal.classList.remove('hidden');
}

// Handles submission of the new/edit contact form.
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
        // If an ID exists, update the existing document.
        const contactDoc = doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId);
        await updateDoc(contactDoc, contactData);
    } else {
        // Otherwise, create a new document.
        contactData.position = {
            x: parseInt(contactForm.dataset.positionX),
            y: parseInt(contactForm.dataset.positionY)
        };
        contactData.tags = [];
        await addDoc(contactsCollection, contactData);
    }
    
    contactModal.classList.remove('flex');
    contactModal.classList.add('hidden');
});
        
// --- Drag and Drop Logic ---
// Fired when the user starts dragging a contact bubble.
function handleDragStart(e) {
    draggedElement = e.target.closest('.contact-bubble');
    e.dataTransfer.setData('text/plain', draggedElement.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    // Use a small timeout to apply styling *after* the browser creates the drag image.
    setTimeout(() => {
        draggedElement.classList.add('dragging');
    }, 0);
}

// Allows the map canvas to be a valid drop target.
mapCanvas.addEventListener('dragover', (e) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
});

// Fired when the user drops the contact bubble.
mapCanvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!draggedElement) return;

    draggedElement.classList.remove('dragging');
    
    const contactId = e.dataTransfer.getData('text/plain');
    const canvasRect = mapCanvas.getBoundingClientRect();
    
    // Calculate position relative to the canvas, accounting for scroll.
    let x = e.clientX - canvasRect.left + mapCanvas.scrollLeft;
    let y = e.clientY - canvasRect.top + mapCanvas.scrollTop;

    // Check if the drop target is a cluster.
    const targetCluster = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList.contains('cluster'));
    let clusterId = null;

    if (targetCluster) {
        // If dropped on a cluster, update clusterId and adjust position to be inside it.
        clusterId = targetCluster.id.replace('cluster-', '');
        const clusterRect = targetCluster.getBoundingClientRect();
        x = e.clientX - clusterRect.left + targetCluster.offsetLeft + 10;
        y = e.clientY - clusterRect.top + targetCluster.offsetTop + 10;
    }

    // Update the contact's position in Firestore.
    const contactDoc = doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId);
    await updateDoc(contactDoc, {
        position: { x: Math.round(x), y: Math.round(y) },
        clusterId: clusterId // Note: this field is saved but not yet used for snapping.
    });

    draggedElement = null;
});

// Cleans up styles after the drag operation ends.
mapCanvas.addEventListener('dragend', () => {
     if(draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
    }
});

// --- Tagging Modal ---
// Opens the modal for viewing contact details and assigning tags.
function openTaggingModal(contact) {
    taggingModal.dataset.contactId = contact.id;
    document.getElementById('tagging-contact-name').textContent = `${contact.firstName} ${contact.lastName}`;
    document.getElementById('tagging-contact-role').textContent = contact.role;
    
    // Dynamically create tag buttons and highlight selected ones.
    tagsContainer.innerHTML = '';
    allTags.forEach(tag => {
        const isSelected = (contact.tags || []).includes(tag);
        const tagButton = document.createElement('button');
        tagButton.textContent = tag;
        tagButton.dataset.tag = tag;
        tagButton.className = `px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            isSelected 
            ? 'bg-sky-600 text-white' 
            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
        }`;
        tagButton.addEventListener('click', () => toggleTag(tag));
        tagsContainer.appendChild(tagButton);
    });
    
    // Set up action buttons in the modal.
    editContactFromTagModalBtn.onclick = () => {
        taggingModal.classList.remove('flex');
        taggingModal.classList.add('hidden');
        openContactModal(contact); // Open the edit contact modal
    };

    deleteContactBtn.onclick = async () => {
         // Replace window.confirm with a custom modal in a real app.
         if(window.confirm("Are you sure you want to delete this contact? This cannot be undone.")){
            const contactDoc = doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contact.id);
            await deleteDoc(contactDoc);
            taggingModal.classList.remove('flex');
            taggingModal.classList.add('hidden');
         }
    };
    
    taggingModal.classList.add('flex');
    taggingModal.classList.remove('hidden');
}

// Toggles a tag on a contact and updates Firestore.
async function toggleTag(tag) {
    const contactId = taggingModal.dataset.contactId;
    const contactDocRef = doc(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`, contactId);
    const button = tagsContainer.querySelector(`[data-tag="${tag}"]`);

    // Get the latest contact data to avoid race conditions.
    const contactsQuery = query(collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/contacts`));
    const contactSnapshot = await getDocs(contactsQuery);
    const contacts = contactSnapshot.docs.map(d => ({id: d.id, ...d.data()}));
    const contact = contacts.find(c => c.id === contactId);

    let currentTags = contact.tags || [];
    if (currentTags.includes(tag)) {
        // Remove tag
        currentTags = currentTags.filter(t => t !== tag);
        button.className = 'px-3 py-1 rounded-full text-sm font-medium transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300';
    } else {
        // Add tag
        currentTags.push(tag);
        button.className = 'px-3 py-1 rounded-full text-sm font-medium transition-colors bg-sky-600 text-white';
    }
    await updateDoc(contactDocRef, { tags: currentTags });
}

closeTaggingBtn.addEventListener('click', () => {
    taggingModal.classList.remove('flex');
    taggingModal.classList.add('hidden');
});

// --- Cluster Logic ---
// Creates a new cluster on the map.
addClusterBtn.addEventListener('click', async () => {
    if (!userId || !currentDealId) return;

    // Use a simple prompt for the MVP. A custom modal would be better in a production app.
    const clusterName = window.prompt("Enter a name for the new cluster (e.g., 'IT Department'):");
    if (clusterName) {
        const clustersCollection = collection(db, `artifacts/${appId}/users/${userId}/deals/${currentDealId}/clusters`);
        await addDoc(clustersCollection, {
            name: clusterName,
            // Stagger new clusters vertically to prevent them from overlapping initially.
            position: { x: 50, y: 50 + (document.querySelectorAll('.cluster').length * 250) } 
        });
    }
});

// --- App Entry Point ---
// This starts the entire application.
initializeFirebase();
