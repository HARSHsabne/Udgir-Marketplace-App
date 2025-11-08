import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.js";

// Global State Variables (using global Canvas variables where available)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// NOTE: firebaseConfig now holds Supabase URL and Anon Key
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Supabase State Variables
let supabase, userId = null;
let currentListings = [];
let currentFilter = 'All';
const LISTINGS_TABLE = 'listings'; // Supabase Table Name
const BUCKET_NAME = 'listing_images'; // Supabase Storage Bucket Name

// =================================================================
// Custom Message/Toast Function (REMAINS THE SAME)
// =================================================================
function showMessage(title, message, type = 'success') {
    // ... (Your original showMessage function code remains here)
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
    
    const iconName = iconEl.getAttribute('data-lucide');
    iconEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${iconName.toLowerCase()}"><path d="${getIconPath(iconName)}"/></svg>`;
    
    toast.classList.remove('hidden');
    toast.classList.add('toast-show');

    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('hidden');
    }, 4000);
}

function getIconPath(name) {
    switch (name) {
        case 'CheckCircle': return 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M12 2v10 M12 12l2-2 M12 12l-2-2';
        case 'XCircle': return 'M15 9l-6 6 M9 9l6 6 M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z';
        default: return '';
    }
}


// =================================================================
// Supabase Initialization and Authentication (FIXED CONFIG)
// =================================================================
async function initSupabase() {
    try {
        // NOTE: Supabase URL and Anon Key are correctly assigned here.
        const supabaseUrl = 'https://arnaegobfepqfwctudpw.supabase.co'; // <--- URL
        const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybmFlZ29iZmVwcWZ3Y3R1ZHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDUzNTUsImV4cCI6MjA3ODAyMTM1NX0.l5l-lceMGvK7jp_DUV8lXlRofg_7SurOfaE28EZ0xTI'; // <--- Key

        if (supabaseUrl && supabaseAnonKey) {
            // Initialize Supabase Client
            supabase = createClient(supabaseUrl, supabaseAnonKey);

            // 1. Handle Authentication
            let authResponse;
            if (initialAuthToken) {
                // Supabase doesn't use custom tokens like Firebase. This assumes 
                // initialAuthToken is a JWT/session to set for an existing user.
                const { error: sessionError } = await supabase.auth.setSession({
                    access_token: initialAuthToken,
                    refresh_token: null
                });
                if (sessionError) throw sessionError;
                authResponse = await supabase.auth.getUser();

            } else {
                // Sign in Anonymously
                authResponse = await supabase.auth.signInAnonymously();
            }

            if (authResponse.error) throw authResponse.error;
            const user = authResponse.data.user;

            // 2. Setup Auth Listener (Supabase style)
            supabase.auth.onAuthStateChange((event, session) => {
                const currentUser = session?.user;
                if (currentUser) {
                    userId = currentUser.id;
                    document.getElementById('user-id-display').textContent = `Your ID: ${userId}`;
                    document.getElementById('user-id-display').classList.remove('hidden');

                    setupRealTimeListings();
                } else {
                    console.warn("User state changed, but no user is signed in.");
                }
            });

            // If sign-in was successful initially, set up the listener immediately
            if (user) {
                userId = user.id;
                document.getElementById('user-id-display').textContent = `Your ID: ${userId}`;
                document.getElementById('user-id-display').classList.remove('hidden');
                setupRealTimeListings();
            }


        } else {
            console.error("Supabase config is incomplete. Data persistence is disabled.");
            showMessage('Error', 'Database configuration missing.', 'error');
            document.getElementById('loading-message').textContent = 'Database configuration missing. Displaying static content only.';
        }
    } catch (error) {
        console.error("Supabase initialization failed:", error);
        showMessage('Error', `Supabase Init Error: ${error.message.substring(0, 50)}...`, 'error');
    }
}


// =================================================================
// Listing Rendering Functions (REMAINS MOSTLY THE SAME)
// =================================================================

const DEFAULT_IMAGE_URL = 'https://placehold.co/192x192/0E7490/ffffff?text=No+Image';

function renderListingCard(listing) {
    // Note: Supabase timestamp comes as a string, no .toDate() needed
    const imageSrc = listing.imageUrl && listing.imageUrl.trim() !== '' ? listing.imageUrl : DEFAULT_IMAGE_URL;
    const date = new Date(listing.timestamp).toLocaleDateString();
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
    container.innerHTML = ''; 

    if (loadingMessage) {
        loadingMessage.style.display = 'none';
    }

    const filteredListings = currentFilter === 'All' 
        ? listings 
        : listings.filter(l => l.category === currentFilter);
    
    if (filteredListings.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500">No listings found for the category: ${currentFilter}. Be the first to post!</div>`;
        return;
    }

    // Listings are already sorted by the Supabase query
    filteredListings.forEach(listing => {
        container.insertAdjacentHTML('beforeend', renderListingCard(listing));
    });
    
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}


// =================================================================
// Real-Time Listener and Filtering (UPDATED for Supabase Realtime)
// =================================================================
function setupRealTimeListings() {
    if (supabase) {
        // 1. Initial Fetch and Setup Realtime Subscription
        supabase
            .from(LISTINGS_TABLE)
            .select('*')
            .order('timestamp', { ascending: false }) // Sort by latest first
            .then(({ data, error }) => {
                if (error) throw error;
                currentListings = data;
                renderListings(currentListings);
            })
            .catch(error => {
                console.error("Error fetching initial listings:", error);
                showMessage('Error', 'Failed to load initial listings.', 'error');
            });


        // 2. Realtime Subscription for subsequent changes
        // Use a unique channel for the application
        const channelName = `public_listings_changes_${appId}`;
        supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: LISTINGS_TABLE },
                (payload) => {
                    // Refetch all data to maintain consistent order/state, 
                    supabase
                        .from(LISTINGS_TABLE)
                        .select('*')
                        .order('timestamp', { ascending: false })
                        .then(({ data, error }) => {
                            if (error) throw error;
                            currentListings = data;
                            renderListings(currentListings);
                        })
                        .catch(error => console.error("Realtime update error:", error));
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("Supabase Realtime Subscribed!");
                }
            });
    }
}

// Expose functions globally so they can be called from the HTML `onclick` attributes (REMAINS THE SAME)
window.filterCategory = function(category) {
    currentFilter = category;
    window.switchTab('buy');
    renderListings(currentListings);
    document.getElementById('listings').scrollIntoView({ behavior: 'smooth' });
}

// =================================================================
// Tab Switching Logic (MOVED TO GLOBAL SCOPE - FIX FOR REFERENCE ERROR)
// =================================================================
// FIX: Define switchTab globally so the HTML onclick can access it immediately.
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
                renderListings(currentListings); 
            }
        } else {
            tab.button.classList.remove('border-teal-500', 'text-teal-600', 'active-tab');
            tab.button.classList.add('border-transparent', 'text-gray-600');
            tab.content.classList.add('hidden');
        }
    });
}


// =================================================================
// File Upload Utility Function (UPDATED for Supabase Storage)
// =================================================================

/**
 * Uploads a file to Supabase Storage and returns the download URL.
 * @param {File} file The image file to upload.
 * @param {string} userId The current user ID.
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
async function uploadImage(file, userId) {
    if (!supabase) {
        throw new Error("Supabase client not initialized.");
    }
    
    // Create a unique file name
    const timestamp = Date.now();
    // Path: images/listings/{userId}_{timestamp}_{filename}
    const filePath = `images/listings/${userId}_${timestamp}_${file.name}`;
    
    // Upload the file
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

    if (error) {
        throw error;
    }
    
    // Get the public download URL
    const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
}


// =================================================================
// Form Submission Logic (UPDATED for Supabase Insert)
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
            const imageFile = document.getElementById('imageFile').files[0]; 
            let imageUrl = document.getElementById('imageUrl').value.trim(); 

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
                    if (imageFile.size > 5 * 1024 * 1024) {
                        showMessage('Upload Error', 'Image file is too large (max 5MB).', 'error');
                        postButton.disabled = false;
                        postButton.textContent = 'Post Listing';
                        return;
                    }
                    
                    imageUrl = await uploadImage(imageFile, userId);
                    postButton.textContent = 'Saving Listing...';
                }

                // 2. Save Listing to Supabase
                if (supabase) {
                    const { error } = await supabase
                        .from(LISTINGS_TABLE)
                        .insert([
                            {
                                title: title,
                                category: category,
                                price: price,
                                description: description,
                                imageUrl: imageUrl, 
                                sellerId: userId,
                                timestamp: new Date().toISOString() // Supabase prefers ISO string
                            }
                        ]);

                    if (error) throw error;

                    showMessage('Success!', 'Your listing has been posted and is now live!', 'success');
                    e.target.reset();
                    window.switchTab('buy'); 

                } else {
                    showMessage('System Error', 'Database connection not ready.', 'error');
                }

            } catch (error) {
                console.error("Error during posting or upload: ", error);
                showMessage('Error', `Failed to post listing. Error: ${error.message.substring(0, 50)}...`, 'error');
            } finally {
                postButton.disabled = false;
                postButton.textContent = 'Post Listing';
            }
        });
    }
    
    // Initialize Supabase and set default tab on load
    initSupabase();
    // This call is now safe because window.switchTab is defined above.
    window.switchTab('buy');
});


