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

router.post("/create",                    protect('ADMIN'), createWallet);
router.get( "/balance",                   protect('ADMIN'), getBalance);
router.get( "/transactions",              protect('ADMIN'), getTransactions);
router.get( "/bank-accounts",             protect('ADMIN'), getBankAccounts);
router.post("/bank-account",              protect('ADMIN'), addBankAccount);
router.delete("/bank-account/:id",        protect('ADMIN'), deleteBankAccount);
router.post("/withdraw",                  protect('ADMIN'), requestWithdrawal);
router.get( "/withdrawals",               protect('ADMIN'), getWithdrawals);
router.get( "/pending-payouts/:event_id", protect('ADMIN'), getPendingPayouts);
router.get( "/pending-payments",          protect('ADMIN'), getPendingPayments);

module.exports = router;