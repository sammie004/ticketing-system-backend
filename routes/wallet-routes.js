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

router.post("/create",                    protect, createWallet);
router.get( "/balance",                   protect, getBalance);
router.get( "/transactions",              protect, getTransactions);
router.get( "/bank-accounts",             protect, getBankAccounts);
router.post("/bank-account",              protect, addBankAccount);
router.delete("/bank-account/:id",        protect, deleteBankAccount);
router.post("/withdraw",                  protect, requestWithdrawal);
router.get( "/withdrawals",               protect, getWithdrawals);
router.get( "/pending-payouts/:event_id", protect, getPendingPayouts);
router.get( "/pending-payments",          protect, getPendingPayments);

module.exports = router;