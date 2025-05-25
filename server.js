// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data file path
const DATA_FILE = path.join(__dirname, 'reminders.json');

// Initialize data file
async function initializeDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        await fs.writeFile(DATA_FILE, JSON.stringify({}));
    }
}

// Load reminders for a user
async function loadReminders(userId = 'default') {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const allReminders = JSON.parse(data);
        return allReminders[userId] || [];
    } catch (error) {
        return [];
    }
}

// Save reminders for a user
async function saveReminders(userId = 'default', reminders) {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const allReminders = JSON.parse(data);
        allReminders[userId] = reminders;
        await fs.writeFile(DATA_FILE, JSON.stringify(allReminders, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving reminders:', error);
        return false;
    }
}

// Routes

// Get all reminders for a user
app.get('/api/reminders/:userId?', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        const reminders = await loadReminders(userId);
        res.json({ success: true, reminders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a new reminder
app.post('/api/reminders/:userId?', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        const { text, time } = req.body;
        
        if (!text || !time) {
            return res.status(400).json({ 
                success: false, 
                error: 'Text and time are required' 
            });
        }
        
        const reminders = await loadReminders(userId);
        const newReminder = {
            id: Date.now(),
            text,
            time: new Date(time).toISOString(),
            notified: false,
            created: new Date().toISOString()
        };
        
        reminders.push(newReminder);
        const saved = await saveReminders(userId, reminders);
        
        if (saved) {
            res.json({ success: true, reminder: newReminder });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save reminder' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a reminder
app.delete('/api/reminders/:userId?/:reminderId', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        const reminderId = parseInt(req.params.reminderId);
        
        let reminders = await loadReminders(userId);
        const initialLength = reminders.length;
        
        reminders = reminders.filter(r => r.id !== reminderId);
        
        if (reminders.length === initialLength) {
            return res.status(404).json({ 
                success: false, 
                error: 'Reminder not found' 
            });
        }
        
        const saved = await saveReminders(userId, reminders);
        
        if (saved) {
            res.json({ success: true, message: 'Reminder deleted' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to delete reminder' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update reminder (mark as notified)
app.put('/api/reminders/:userId?/:reminderId', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        const reminderId = parseInt(req.params.reminderId);
        const updates = req.body;
        
        const reminders = await loadReminders(userId);
        const reminderIndex = reminders.findIndex(r => r.id === reminderId);
        
        if (reminderIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Reminder not found' 
            });
        }
        
        reminders[reminderIndex] = { ...reminders[reminderIndex], ...updates };
        const saved = await saveReminders(userId, reminders);
        
        if (saved) {
            res.json({ success: true, reminder: reminders[reminderIndex] });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update reminder' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check for due reminders
app.get('/api/check-reminders/:userId?', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        const reminders = await loadReminders(userId);
        const now = new Date();
        
        const dueReminders = reminders.filter(reminder => {
            const reminderTime = new Date(reminder.time);
            return reminderTime <= now && !reminder.notified;
        });
        
        // Mark due reminders as notified
        if (dueReminders.length > 0) {
            dueReminders.forEach(reminder => {
                reminder.notified = true;
            });
            await saveReminders(userId, reminders);
        }
        
        res.json({ success: true, dueReminders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clean up old notified reminders
app.delete('/api/cleanup/:userId?', async (req, res) => {
    try {
        const userId = req.params.userId || 'default';
        let reminders = await loadReminders(userId);
        const initialLength = reminders.length;
        
        // Remove reminders that were notified more than 24 hours ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        reminders = reminders.filter(reminder => {
            if (!reminder.notified) return true;
            const reminderTime = new Date(reminder.time);
            return reminderTime > oneDayAgo;
        });
        
        if (reminders.length !== initialLength) {
            await saveReminders(userId, reminders);
        }
        
        res.json({ 
            success: true, 
            removed: initialLength - reminders.length,
            remaining: reminders.length 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Initialize and start server
async function startServer() {
    try {
        await initializeDataFile();
        app.listen(PORT, () => {
            console.log(`Voice Reminder Assistant server running on port ${PORT}`);
            console.log(`Frontend: http://localhost:${PORT}`);
            console.log(`API: http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();