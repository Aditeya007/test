const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const resolveTenant = require('../middleware/resolveTenant');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const { validateScrapeRequest } = require('../middleware/validate');
const scrapeController = require('../controllers/scrapeController');

router.post('/run', auth, resolveTenant, scrapeLimiter, validateScrapeRequest, scrapeController.startScrape);
router.post('/update', auth, resolveTenant, scrapeLimiter, validateScrapeRequest, scrapeController.runUpdater);

// Get current scrape status
router.get('/status', auth, resolveTenant, scrapeController.getScrapeStatus);

// Scheduler routes
router.post('/scheduler/start', auth, resolveTenant, validateScrapeRequest, scrapeController.startScheduler);
router.post('/scheduler/stop', auth, resolveTenant, scrapeController.stopScheduler);
router.get('/scheduler/status', auth, resolveTenant, scrapeController.getSchedulerStatus);

// Internal endpoint for scheduler to notify scrape completion (uses service secret instead of auth)
router.post('/scheduler/scrape-complete', scrapeController.notifyScrapeComplete);

module.exports = router;
