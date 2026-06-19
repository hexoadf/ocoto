require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ============================================
// Socket.IO Setup
// ============================================
const io = socketIo(server, {
    cors: {
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', '*'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// ============================================
// Middleware
// ============================================
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', '*'],
    credentials: true
}));
app.use(express.json());

// ============================================
// Supabase Setup
// ============================================
const supabase = createClient(
    'https://tyhcvjyhlgpernuvcxuq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5aGN2anlobGdwZXJudXZjeHVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTcxNzMxMiwiZXhwIjoyMDk3MjkzMzEyfQ.zKwrvIqANgTkGKyKZsjUvRYKeZlS_bSbUxePW-bPtnc'
);

// ============================================
// Store Data
// ============================================
const tempUserStore = new Map();
const onlineUsers = new Map();

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// Helper: Create User
// ============================================
async function createUser(email, res) {
    try {
        const userData = tempUserStore.get(email);
        if (!userData) {
            return res.status(400).json({ error: 'User data not found' });
        }

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([
                {
                    name: userData.name,
                    email: userData.email,
                    phone: userData.phone,
                    password: userData.password,
                    is_verified: true,
                    profile_pic: null
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email },
            'hexa_chat_secret_key_2026',
            { expiresIn: '7d' }
        );

        tempUserStore.delete(email);
        res.json({
            message: 'Account created successfully',
            token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                profile_pic: newUser.profile_pic
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message });
    }
}

// ============================================
// API ROUTES
// ============================================

// 1. Signup
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }

        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();

        tempUserStore.set(email, {
            name, email, phone,
            password: hashedPassword,
            otp: otp,
            created_at: Date.now()
        });

        res.json({
            message: 'OTP generated. Use debug OTP.',
            email,
            otpSent: false,
            debug_otp: otp
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const userData = tempUserStore.get(email);

        if (!userData) {
            return res.status(400).json({ error: 'No signup request found' });
        }

        if (userData.otp === otp) {
            return await createUser(email, res);
        }

        return res.status(400).json({ error: 'Invalid OTP' });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`🔑 Login attempt: ${email}`);

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            'hexa_chat_secret_key_2026',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                profile_pic: user.profile_pic
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Get all users
app.get('/api/users', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, email, phone, profile_pic')
            .order('name');

        if (error) throw error;
        res.json({ users });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Get user by ID
app.get('/api/user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: user, error } = await supabase
            .from('users')
            .select('id, name, email, phone, profile_pic')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json({ user });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Update user
app.put('/api/user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, profile_pic } = req.body;

        const updateData = {};
        if (name !== undefined && name !== null && name !== '') updateData.name = name;
        if (profile_pic !== undefined) updateData.profile_pic = profile_pic;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Supabase update error:', error);
            return res.status(500).json({ error: 'Database error: ' + error.message });
        }

        console.log('✅ User updated:', user);
        res.json({ user });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. Save message
app.post('/api/messages', async (req, res) => {
    try {
        const { sender_id, receiver_id, message } = req.body;

        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert([
                {
                    sender_id,
                    receiver_id,
                    message,
                    created_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) throw error;
        res.json({ message: newMessage });

    } catch (error) {
        console.error('Save message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. Get messages between two users
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ messages });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 9. Add contact
app.post('/api/contacts', async (req, res) => {
    try {
        const { user_id, contact_id, contact_name } = req.body;

        const { data: existing } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user_id)
            .eq('contact_id', contact_id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Contact already exists' });
        }

        const { data: contact, error } = await supabase
            .from('contacts')
            .insert([
                {
                    user_id,
                    contact_id,
                    contact_name: contact_name || null
                }
            ])
            .select(`
                *,
                contact:contact_id (
                    id,
                    name,
                    email,
                    phone,
                    profile_pic
                )
            `)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to add contact' });
        }

        res.json({ contact });

    } catch (error) {
        console.error('Add contact error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 10. Get user contacts
app.get('/api/contacts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data: contacts, error } = await supabase
            .from('contacts')
            .select(`
                *,
                contact:contact_id (
                    id,
                    name,
                    email,
                    phone,
                    profile_pic
                )
            `)
            .eq('user_id', userId);

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Failed to get contacts' });
        }

        res.json({ contacts: contacts || [] });

    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 11. Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: '✅ Hexa Chat API working!',
        serverTime: new Date().toISOString()
    });
});

// ============================================
// SOCKET.IO - COMPLETE FIXED
// ============================================
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // User online
    socket.on('user-online', (userId) => {
        onlineUsers.set(userId, socket.id);
        io.emit('online-users', Array.from(onlineUsers.keys()));
        console.log(`👤 User ${userId} is online (${onlineUsers.size} users online)`);
    });

    // ============================================
    // SEND MESSAGE - FIXED
    // ============================================
    socket.on('send-message', async (data) => {
        try {
            const { sender_id, receiver_id, message } = data;
            console.log(`📤 [SOCKET] Message from ${sender_id} to ${receiver_id}: "${message}"`);
            console.log(`📤 [SOCKET] Data received:`, JSON.stringify(data));

            // Save to database
            const { data: newMessage, error } = await supabase
                .from('messages')
                .insert([
                    {
                        sender_id,
                        receiver_id,
                        message,
                        created_at: new Date().toISOString()
                    }
                ])
                .select()
                .single();

            if (error) {
                console.error('❌ [SOCKET] Supabase error:', error);
                socket.emit('message-error', { error: error.message });
                return;
            }

            console.log('✅ [SOCKET] Message saved:', newMessage.id);

            // Send to sender (confirmation)
            socket.emit('message-sent', newMessage);
            console.log(`📨 [SOCKET] Sent to sender: ${sender_id}`);

            // Send to receiver if online
            const receiverSocketId = onlineUsers.get(receiver_id);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new-message', newMessage);
                console.log(`📨 [SOCKET] Sent to receiver: ${receiver_id}`);
            } else {
                console.log(`⚠️ [SOCKET] Receiver ${receiver_id} is offline`);
            }

        } catch (error) {
            console.error('❌ [SOCKET] Error:', error);
            socket.emit('message-error', { error: error.message });
        }
    });

    // Typing indicator
    socket.on('typing', (data) => {
        const { sender_id, receiver_id, isTyping } = data;
        const receiverSocketId = onlineUsers.get(receiver_id);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user-typing', { sender_id, isTyping });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        let disconnectedUser = null;
        for (let [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUser = userId;
                onlineUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUser) {
            io.emit('online-users', Array.from(onlineUsers.keys()));
            console.log(`👤 User ${disconnectedUser} went offline (${onlineUsers.size} users online)`);
        }

        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============================================
// Start Server
// ============================================
server.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════');
    console.log('🚀 Hexa Chat Server Started Successfully!');
    console.log('═══════════════════════════════════════════');
    console.log(`📡 HTTP: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`🗄️  Database: Supabase`);
    console.log('═══════════════════════════════════════════\n');
});