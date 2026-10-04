import { Account } from './accounts.models';

/** The nickname if there is one, otherwise a readable name for the account type. */
export function accountTitle(account: Account): string {
  return account.nickname ?? (account.type === 'CHECKING' ? 'Checking account' : 'Savings account');
}
