/**
 * firebase-service.js
 * Firebase Auth & Cloud Firestore Service Layer
 * Connected for Production Deployment
 */
(function() {
    'use strict';

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyDKCpsjuRfGnrSCbVbLipXZIzmdpoNBDXw",
        authDomain: "web-soap-a7b43.firebaseapp.com",
        projectId: "web-soap-a7b43",
        storageBucket: "web-soap-a7b43.firebasestorage.app",
        messagingSenderId: "68987375223",
        appId: "1:68987375223:web:7defe1fabc83fcdfb9c072",
        measurementId: "G-G5CDC2V5KQ"
    };

    // Initialize Firebase
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('[Firebase Service] App initialized successfully.');
        }
    } else {
        console.error('[Firebase Service Error] Firebase SDK not loaded in window.');
    }

    const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
    const db   = typeof firebase !== 'undefined' ? firebase.firestore() : null;

    // ─── Authentication Service ────────────────────────────────
    const AuthService = {
        /**
         * Sign in using Google Auth Provider via Popup
         */
        loginWithGoogle: async function() {
            if (!auth) throw new Error('Firebase Auth unavailable');
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            try {
                const result = await auth.signInWithPopup(provider);
                console.log('[Auth] Google Sign-In success:', result.user.displayName);
                return result.user;
            } catch (error) {
                console.error('[Auth Error] Google Sign-In failed:', error);
                throw error;
            }
        },

        /**
         * Sign in anonymously for guest sessions
         */
        loginAnonymously: async function() {
            if (!auth) throw new Error('Firebase Auth unavailable');
            try {
                const result = await auth.signInAnonymously();
                console.log('[Auth] Anonymous Sign-In success:', result.user.uid);
                return result.user;
            } catch (error) {
                console.error('[Auth Error] Anonymous Sign-In failed:', error);
                throw error;
            }
        },

        /**
         * Listen to authentication state changes
         */
        onAuthStateChanged: function(callback) {
            if (!auth) return () => {};
            return auth.onAuthStateChanged(user => {
                if (user) {
                    console.log('[Auth] State changed: User logged in ->', user.email || user.displayName || user.uid);
                } else {
                    console.log('[Auth] State changed: User logged out');
                }
                if (typeof callback === 'function') callback(user);
            });
        },

        /**
         * Get current authenticated user
         */
        getCurrentUser: function() {
            return auth ? auth.currentUser : null;
        },

        /**
         * Logout user
         */
        logout: async function() {
            if (!auth) return;
            await auth.signOut();
            console.log('[Auth] User signed out.');
        }
    };

    // ─── Database Service (Firestore) ──────────────────────────
    const DBService = {
        /**
         * Save case playthrough attempt result to Firestore 'user_attempts' collection
         */
        saveCaseAttempt: async function(attemptData) {
            if (!db) {
                console.warn('[DB Service] Firestore unavailable. Attempt data skipped.');
                return null;
            }

            const currentUser = AuthService.getCurrentUser();

            const payload = {
                uid: (currentUser && currentUser.uid) || attemptData.uid || 'anonymous',
                userEmail: (currentUser && currentUser.email) || attemptData.userEmail || 'anonymous',
                displayName: (currentUser && currentUser.displayName) || attemptData.displayName || 'Guest User',
                caseId: attemptData.caseId || 'case_001',
                finalScore: attemptData.finalScore !== undefined ? attemptData.finalScore : 0,
                maxScore: attemptData.maxScore !== undefined ? attemptData.maxScore : 0,
                completedSteps: attemptData.completedSteps || 0,
                totalSteps: attemptData.totalSteps || 0,
                mistakeHistory: attemptData.mistakeHistory || {},
                isFatal: Boolean(attemptData.isFatal),
                completedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                const docRef = await db.collection('user_attempts').add(payload);
                console.log('[DB Service] Case attempt successfully saved to Firestore with ID:', docRef.id);
                return docRef;
            } catch (error) {
                console.error('[DB Service Error] Failed to write to user_attempts:', error);
                throw error;
            }
        }
    };

    // Export to global window scope
    window.AuthService = AuthService;
    window.DBService = DBService;
    window.FirebaseService = { AuthService, DBService };

})();
