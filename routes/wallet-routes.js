const express  = require("express");
const router   = express.Router();

const protect  = require("../middleware/middleware");

const {
  createWallet,
  getBalance,
  getTransactions,
  addBankAccount,
  getBankAccounts,
  deleteBankAccount,
  requestWithdrawal,
  getWithdrawals,
  getPendingPayouts,
  getPendingPayments,
} = require("../wallets/wallet");

/**
 * @openapi
 * /wallet/create:
 *   post:
 *     summary: Create wallet for admin/creator
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Wallet created successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/create", protect("ADMIN"), createWallet);

/**
 * @openapi
 * /wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance retrieved
 */
router.get("/balance", protect("ADMIN"), getBalance);

/**
 * @openapi
 * /wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transactions retrieved
 */
router.get("/transactions", protect("ADMIN"), getTransactions);

/**
 * @openapi
 * /wallet/bank-accounts:
 *   get:
 *     summary: Get bank accounts
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bank accounts retrieved
 */
router.get("/bank-accounts", protect("ADMIN"), getBankAccounts);

/**
 * @openapi
 * /wallet/bank-account:
 *   post:
 *     summary: Add bank account
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bank_name
 *               - account_name
 *               - account_number
 *             properties:
 *               bank_name:
 *                 type: string
 *               account_name:
 *                 type: string
 *               account_number:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Bank account added
 */
router.post("/bank-account", protect("ADMIN"), addBankAccount);

/**
 * @openapi
 * /wallet/bank-account/{id}:
 *   delete:
 *     summary: Delete bank account
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Bank account deleted
 */
router.delete("/bank-account/:id", protect("ADMIN"), deleteBankAccount);

/**
 * @openapi
 * /wallet/withdraw:
 *   post:
 *     summary: Request withdrawal
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bank_account_id
 *             properties:
 *               amount:
 *                 type: number
 *               bank_account_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Withdrawal requested
 */
router.post("/withdraw", protect("ADMIN"), requestWithdrawal);

/**
 * @openapi
 * /wallet/withdrawals:
 *   get:
 *     summary: Get withdrawal history
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Withdrawals retrieved
 */
router.get("/withdrawals", protect("ADMIN"), getWithdrawals);

/**
 * @openapi
 * /wallet/pending-payouts/{event_id}:
 *   get:
 *     summary: Get pending payouts for an event
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Pending payouts retrieved
 */
router.get("/pending-payouts/:event_id", protect("ADMIN"), getPendingPayouts);

/**
 * @openapi
 * /wallet/pending-payments:
 *   get:
 *     summary: Get pending payments
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending payments retrieved
 */
router.get("/pending-payments", protect("ADMIN"), getPendingPayments);

module.exports = router;