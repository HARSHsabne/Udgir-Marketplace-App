import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, setLogLevel, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// NEW: Import necessary Firebase Storage modules
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";


// Global State Variables (using global Canvas variables where available)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db, auth, storage, userId = null; // Added 'storage'
let listingsRef = null;
let currentListings = [];
let currentFilter = 'All';

// =================================================================
// Custom Message/Toast Function
// =================================================================
function showMessage(title, message, type = 'success') {
    const toast = document.getElementById('message-toast');
    const titleEl = document.getElementById('toast-title');
    const messageEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');

    // Reset classes
    toast.className = 'fixed bottom-5 right-5 z-[100] p-4 rounded-xl shadow-2xl hidden';
    iconEl.innerHTML = ''; // Clear icon content

    if (type === 'success') {
        toast.classList.add('bg-teal-600', 'text-white');
        iconEl.setAttribute('data-lucide', 'CheckCircle');
    } else if (type === 'error') {
        toast.classList.add('bg-red-600', 'text-white');
        iconEl.setAttribute('data-lucide', 'XCircle');
    } else {
        toast.classList.add('bg-gray-700', 'text-white');
        iconEl.setAttribute('data-lucide', 'Search');
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Re-render icon (since this function needs the icon path logic)
    const iconName = iconEl.getAttribute('data-lucide');
    iconEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${iconName.toLowerCase()}"><path d="${getIconPath(iconName)}"/></svg>`;
    
    toast.classList.remove('hidden');
    toast.classList.add('toast-show');

    // Hide after 4 seconds
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('hidden');
    }, 4000);
}

// Helper function to get Lucide icon SVG paths (minimal subset)
function getIconPath(name) {
    switch (name) {
        case 'CheckCircle': return 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M12 2v10 M12 12l2-2 M12 12l-2-2';
        case 'XCircle': return 'M15 9l-6 6 M9 9l6 6 M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z';
        default: return '';
    }
}


// =================================================================
// Firebase Initialization and Authentication
// =================================================================
async function initFirebase() {
    try {
        if (Object.keys(firebaseConfig).length > 0) {
            setLogLevel('Debug');
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            // NEW: Initialize storage
            storage = getStorage(app); 
            auth = getAuth(app);

            // Sign in and set up listener
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                    document.getElementById('user-id-display').textContent = `Your ID: ${userId}`;
                    document.getElementById('user-id-display').classList.remove('hidden');

                    // Set up public collection reference and start listening
                    listingsRef = collection(db, `artifacts/${appId}/public/data/listings`);
                    setupRealTimeListings();
                } else {
                    console.warn("User state changed, but no user is signed in.");
                }
            });

        } else {
            console.error("Firebase config is empty. Data persistence is disabled.");
            showMessage('Error', 'Database configuration missing.', 'error');
            document.getElementById('loading-message').textContent = 'Database configuration missing. Displaying static content only.';
        }
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        showMessage('Error', `Firebase Init Error: ${error.message.substring(0, 50)}...`, 'error');
    }
}

// =================================================================
// Listing Rendering Functions
// =================================================================

// Helper for default image URL if none is provided
const DEFAULT_IMAGE_URL = 'https://placehold.co/192x192/0E7490/ffffff?text=No+Image';

function renderListingCard(listing) {
    // Determine the image source, falling back to a default if the URL is empty or null
    const imageSrc = listing.imageUrl && listing.imageUrl.trim() !== '' ? listing.imageUrl : DEFAULT_IMAGE_URL;
    const date = listing.timestamp?.toDate ? listing.timestamp.toDate().toLocaleDateString() : 'N/A';
    const priceFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(listing.price);
    
    return `
        <div class="listing-item bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl">
            <div class="h-48 overflow-hidden bg-gray-200">
                <img 
                    src="${imageSrc}" 
                    alt="${listing.title}" 
                    class="w-full h-full object-cover transition duration-300"
                    onerror="this.onerror=null; this.src='${DEFAULT_IMAGE_URL}'; this.style.filter='grayscale(100%)'; this.classList.remove('object-cover'); this.classList.add('object-contain', 'p-4')"
                >
            </div>
            <div class="p-6">
                <span class="inline-block text-xs font-semibold px-2 py-1 rounded-full text-teal-700 bg-teal-100 mb-2">${listing.category}</span>
                <h3 class="text-xl font-bold text-gray-800 mb-2">${listing.title}</h3>
                <p class="text-2xl font-extrabold text-teal-600 mb-2">${priceFormatted}</p>
                <p class="text-sm text-gray-500 mb-4 truncate">${listing.description}</p>
                <p class="text-xs text-gray-400 mb-4">Posted: ${date} by ${listing.sellerId.substring(0, 8)}...</p>
                <button class="block w-full text-center py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition duration-200">Contact Seller</button>
            </div>
        </div>
    `;
}

function renderListings(listings) {
    const container = document.getElementById('listings-container');
    const loadingMessage = document.getElementById('loading-message');
    container.innerHTML = ''; // Clear previous listings

    if (loadingMessage) {
        loadingMessage.style.display = 'none';
    }

    // Apply filter
    const filteredListings = currentFilter === 'All' 
        ? listings 
        : listings.filter(l => l.category === currentFilter);
    
    if (filteredListings.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500">No listings found for the category: ${currentFilter}. Be the first to post!</div>`;
        return;
    }

    filteredListings.forEach(listing => {
        container.insertAdjacentHTML('beforeend', renderListingCard(listing));
    });
    // Re-render lucide icons after injecting new HTML
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

// =================================================================
// Real-Time Listener and Filtering
// =================================================================
function setupRealTimeListings() {
    if (listingsRef) {
        // Query: Fetching all public listings.
        onSnapshot(query(listingsRef), (snapshot) => {
            const tempListings = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                tempListings.push({ id: doc.id, ...data });
            });
            
            // Sort listings by timestamp in memory (latest first)
            tempListings.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
                return timeB - timeA;
            });
            
            currentListings = tempListings;
            renderListings(currentListings);
        }, (error) => {
            console.error("Error listening to listings:", error);
            showMessage('Error', 'Failed to load listings. Connection error.', 'error');
            document.getElementById('loading-message').textContent = 'Failed to load listings.';
        });
    }
}

// Expose functions globally so they can be called from the HTML `onclick` attributes
window.filterCategory = function(category) {
    currentFilter = category;
    window.switchTab('buy');
    renderListings(currentListings);
    document.getElementById('listings').scrollIntoView({ behavior: 'smooth' });
}

// =================================================================
// File Upload Utility Function
// =================================================================

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param {File} file The image file to upload.
 * @param {string} userId The current user ID.
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
async function uploadImage(file, userId) {
    if (!storage) {
        throw new Error("Firebase Storage not initialized.");
    }
    
    // Create a unique file name
    const timestamp = Date.now();
    const fileName = `${userId}_${timestamp}_${file.name}`;
    
    // Create a reference to the storage location
    // Path: /artifacts/{appId}/images/listings/{userId}_{timestamp}_{filename}
    const storageRef = ref(storage, `artifacts/${appId}/images/listings/${fileName}`);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the public download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
}


// =================================================================
// Form Submission Logic (Updated for Image Upload)
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('listing-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!userId) {
                showMessage('Authentication Error', 'Please wait for authentication to complete before posting.', 'error');
                return;
            }

            const title = document.getElementById('title').value;
            const category = document.getElementById('category').value;
            const price = parseFloat(document.getElementById('price').value);
            const description = document.getElementById('description').value;
            const imageFile = document.getElementById('imageFile').files[0]; // Get the uploaded file
            let imageUrl = document.getElementById('imageUrl').value.trim(); // Get the optional URL

            // Input Validation
            if (price <= 0) {
                 showMessage('Input Error', 'Price must be greater than zero.', 'error');
                 return;
            }

            const postButton = document.getElementById('post-button');
            postButton.disabled = true;
            postButton.textContent = 'Uploading Image...';
            
            try {
                // 1. Handle File Upload if present
                if (imageFile) {
                    // Maximum file size check (5MB)
                    if (imageFile.size > 5 * 1024 * 1024) {
                        showMessage('Upload Error', 'Image file is too large (max 5MB).', 'error');
                        postButton.disabled = false;
                        postButton.textContent = 'Post Listing';
                        return;
                    }
                    
                    // Upload the file and get the permanent URL
                    imageUrl = await uploadImage(imageFile, userId);
                    postButton.textContent = 'Saving Listing...';
                }

                // 2. Save Listing to Firestore
                if (db && listingsRef) {
                    await addDoc(listingsRef, {
                        title: title,
                        category: category,
                        price: price,
                        description: description,
                        imageUrl: imageUrl, // Will be uploaded URL, or user-provided URL, or empty string
                        sellerId: userId,
                        timestamp: new Date()
                    });

                    showMessage('Success!', 'Your listing has been posted and is now live!', 'success');
                    e.target.reset();
                    window.switchTab('buy'); 

                } else {
                    showMessage('System Error', 'Database connection not ready.', 'error');
                }

            } catch (error) {
                console.error("Error during posting or upload: ", error);
                showMessage('Error', `Failed to post listing. Upload error: ${error.message.substring(0, 50)}...`, 'error');
            } finally {
                postButton.disabled = false;
                postButton.textContent = 'Post Listing';
            }
        });
    }


    // =================================================================
    // Tab Switching Logic
    // =================================================================
    window.switchTab = function(tabName) {
        const tabs = [
            { name: 'buy', button: document.getElementById('buy_tab'), content: document.getElementById('buy_content') },
            { name: 'sell', button: document.getElementById('sell_tab'), content: document.getElementById('sell_content') }
        ];

        tabs.forEach(tab => {
            if (tab.name === tabName) {
                tab.button.classList.add('border-teal-500', 'text-teal-600', 'active-tab');
                tab.button.classList.remove('border-transparent', 'text-gray-600');
                tab.content.classList.remove('hidden');
                if (tabName === 'buy') {
                    renderListings(currentListings); // Re-render when switching to buy
                }
            } else {
                tab.button.classList.remove('border-teal-500', 'text-teal-600', 'active-tab');
                tab.button.classList.add('border-transparent', 'text-gray-600');
                tab.content.classList.add('hidden');
            }
        });
    }
    
    // Initialize Firebase and set default tab on load
    initFirebase();
    window.switchTab('buy');
});