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

    // ─── Session Persistence ───────────────────────────────────
    // Compat SDK equivalent of setPersistence(auth, browserLocalPersistence).
    // LOCAL survives tab close and refresh; this is set before any sign-in
    // call so the very first login already writes a durable session.
    let persistenceReady = Promise.resolve();
    if (auth) {
        persistenceReady = auth
            .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => console.log('[Auth] Persistence set to LOCAL (survives refresh).'))
            .catch(err => console.error('[Auth Error] setPersistence failed:', err));
    }

    // ─── Auth Ready Gate ───────────────────────────────────────
    // Resolves exactly once, on the FIRST onAuthStateChanged callback.
    // Until it settles the app cannot know whether a session is being
    // restored, so the UI must show the splash rather than guess.
    window.authReadyPromise = new Promise(resolve => {
        if (!auth) {
            console.warn('[Auth] SDK unavailable — resolving authReadyPromise with null.');
            resolve(null);
            return;
        }

        let settled = false;
        const unsubscribe = auth.onAuthStateChanged(
            user => {
                if (settled) return;
                settled = true;
                console.log('[Auth] Initial state resolved:', user ? (user.email || user.uid) : 'no session');
                if (typeof unsubscribe === 'function') unsubscribe();
                resolve(user);
            },
            err => {
                if (settled) return;
                settled = true;
                console.error('[Auth Error] Initial state check failed:', err);
                resolve(null);
            }
        );

        // Safety valve: never let the splash hang forever on a network stall.
        setTimeout(() => {
            if (settled) return;
            settled = true;
            console.warn('[Auth] Initial state timed out after 8s — continuing as signed out.');
            resolve(null);
        }, 8000);
    });

    // ─── Authentication Service ────────────────────────────────
    const AuthService = {
        /**
         * Sign in using Google Auth Provider via Popup
         */
        loginWithGoogle: async function() {
            if (!auth) throw new Error('Firebase Auth unavailable');
            await persistenceReady;
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
            await persistenceReady;
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

            // Optional analytics fields. Copied only when the engine actually
            // supplied them, so a field is either a real measurement or absent
            // — never a zero standing in for "we did not record this".
            [
                'caseVersion', 'schemaVersion', 'stepLog', 'durationSec',
                'gradedSteps', 'perfectSteps', 'wrongPicks', 'bestStepStreak',
                'localHour', 'localDayKey', 'localWeekday', 'dtpTag', 'dtpCorrect'
            ].forEach(k => {
                if (attemptData[k] !== undefined) payload[k] = attemptData[k];
            });

            try {
                const docRef = await db.collection('user_attempts').add(payload);
                console.log('[DB Service] Case attempt successfully saved to Firestore with ID:', docRef.id);
                return docRef;
            } catch (error) {
                console.error('[DB Service Error] Failed to write to user_attempts:', error);
                throw error;
            }
        },

        /**
         * Read this user's own attempt history.
         * Returns { ok, reason, rows } — never throws, so the UI can show a
         * truthful state instead of an empty panel that looks like "no data".
         */
        getMyAttempts: async function() {
            if (!db) return { ok: false, reason: 'offline', rows: [] };

            const user = AuthService.getCurrentUser();
            if (!user) return { ok: false, reason: 'signed-out', rows: [] };

            try {
                const snap = await db.collection('user_attempts')
                    .where('uid', '==', user.uid)
                    .limit(200)
                    .get();

                const rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
                // Sort client-side so no composite index is required.
                rows.sort((a, b) => {
                    const ta = a.completedAt && a.completedAt.seconds ? a.completedAt.seconds : 0;
                    const tb = b.completedAt && b.completedAt.seconds ? b.completedAt.seconds : 0;
                    return tb - ta;
                });
                console.log(`[DB Service] Loaded ${rows.length} attempt(s) for ${user.uid}.`);
                return { ok: true, reason: null, rows: rows };
            } catch (error) {
                console.error('[DB Service Error] getMyAttempts failed:', error);
                return {
                    ok: false,
                    reason: error.code === 'permission-denied' ? 'permission-denied' : 'error',
                    rows: [],
                    message: error.message
                };
            }
        },

        /**
         * Read the global best-score leaderboard.
         * Requires Firestore rules that permit reading user_attempts.
         */
        getLeaderboard: async function(max) {
            if (!db) return { ok: false, reason: 'offline', rows: [] };

            try {
                const snap = await db.collection('user_attempts').limit(500).get();

                // Best attempt per user, ranked by accuracy then raw score.
                const best = {};
                snap.docs.forEach(d => {
                    const a = d.data();
                    if (!a || !a.uid || a.isFatal) return;
                    const pct = a.maxScore > 0 ? a.finalScore / a.maxScore : 0;
                    const cur = best[a.uid];
                    if (!cur || pct > cur.pct || (pct === cur.pct && a.finalScore > cur.finalScore)) {
                        best[a.uid] = {
                            uid: a.uid,
                            displayName: a.displayName || 'Clinician',
                            finalScore: a.finalScore || 0,
                            maxScore: a.maxScore || 0,
                            caseId: a.caseId,
                            pct: pct
                        };
                    }
                });

                const rows = Object.values(best)
                    .sort((x, y) => y.pct - x.pct || y.finalScore - x.finalScore)
                    .slice(0, max || 20);

                console.log(`[DB Service] Leaderboard built from ${snap.size} attempt(s) → ${rows.length} player(s).`);
                return { ok: true, reason: null, rows: rows };
            } catch (error) {
                console.error('[DB Service Error] getLeaderboard failed:', error);
                return {
                    ok: false,
                    reason: error.code === 'permission-denied' ? 'permission-denied' : 'error',
                    rows: [],
                    message: error.message
                };
            }
        },

        /**
         * Read the cohort's attempts for the instructor analytics panel.
         *
         * Deliberately unordered: adding .orderBy() here would demand the
         * composite index in firestore.indexes.json to be live before the
         * panel works at all. Aggregation is cheap client-side at this
         * cohort size, so a missing index degrades to "slower", not "broken".
         *
         * Identity is dropped on read — faculty see cohort behaviour, not
         * who made which mistake.
         */
        getAllAttempts: async function(max) {
            if (!db) return { ok: false, reason: 'offline', rows: [] };

            const user = AuthService.getCurrentUser();
            if (!user) return { ok: false, reason: 'signed-out', rows: [] };

            try {
                const snap = await db.collection('user_attempts').limit(max || 1000).get();

                const rows = snap.docs.map(d => {
                    const a = d.data() || {};
                    return {
                        // No uid, email or displayName — anonymised at the boundary.
                        caseId: a.caseId || 'unknown',
                        finalScore: a.finalScore || 0,
                        maxScore: a.maxScore || 0,
                        completedSteps: a.completedSteps || 0,
                        totalSteps: a.totalSteps || 0,
                        isFatal: Boolean(a.isFatal),
                        dtpTag: a.dtpTag != null ? a.dtpTag : null,
                        dtpCorrect: a.dtpCorrect != null ? a.dtpCorrect : null,
                        caseVersion: a.caseVersion || null,
                        mistakeHistory: a.mistakeHistory || {},
                        completedAt: a.completedAt || null
                    };
                });

                console.log(`[DB Service] Instructor analytics: ${rows.length} attempt(s) aggregated.`);
                return { ok: true, reason: null, rows: rows };
            } catch (error) {
                console.error('[DB Service Error] getAllAttempts failed:', error);
                return {
                    ok: false,
                    reason: error.code === 'permission-denied' ? 'permission-denied'
                          : error.code === 'failed-precondition' ? 'missing-index'
                          : 'error',
                    rows: [],
                    message: error.message
                };
            }
        }
    };

    // Export to global window scope
    window.AuthService = AuthService;
    window.DBService = DBService;
    window.FirebaseService = { AuthService, DBService };

})();
