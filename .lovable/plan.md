
# Team Payments Dashboard - Implementation Plan

## Overview
Create a separate dashboard for managing team member finances, independent of workshops. This allows admins to give money to team members who can then use it across multiple workshops.

## Key Changes

### 1. New Database Table: `team_transfers`
A new table to track money given to team members (not tied to any workshop):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Team member receiving money |
| amount | NUMERIC | Amount transferred |
| transfer_date | DATE | When the transfer happened |
| description | TEXT | Optional note |
| created_by | UUID | Admin who made the transfer |
| created_at | TIMESTAMP | Record creation time |

RLS Policies:
- Admins can manage all transfers
- Users can view their own transfers

### 2. New Page: Team Dashboard (`/team`)
**Admin View:**
- List of all team members with their balances
- Click on a team member to see their profile
- Button to add money to any team member

**Member Profile View (when clicking a team member):**
- Summary card showing:
  - Total Received (from all transfers)
  - Total Spent (from all approved payments across all workshops)
  - Current Balance
- Transfer History table (money received from admin)
- Payment History table (where they spent money, showing workshop name)

### 3. New Components

| Component | Purpose |
|-----------|---------|
| `TeamDashboard.tsx` | Main page for team finances |
| `TeamMemberCard.tsx` | Shows member name and balance summary |
| `TeamMemberProfile.tsx` | Detailed view of a member's finances |
| `TeamTransferForm.tsx` | Modal for admin to add money to member |
| `TeamTransferHistory.tsx` | Table of transfers received |
| `TeamSpendingHistory.tsx` | Table of payments made across workshops |

### 4. Remove Team Payments from Workshop Flow
- Update `PaymentForm.tsx` to remove the "Pay Team Member" option
- The workshop dashboard will only handle external payments
- Team member payments move to the new Team Dashboard

### 5. User Balance Updates
- Update `UserBalanceCard.tsx` to calculate balance from `team_transfers` instead of `user_transfers`
- Users will see their global balance (not per-workshop)

### 6. Navigation Update
Add "Team" link to admin navigation in `Layout.tsx` (using `Users2` icon)

## Data Flow

```text
Admin gives money to team member
          |
          v
+-------------------+
| team_transfers    |  (NEW - workshop-independent)
+-------------------+
          |
          v
Team member's global balance increases
          |
          v
Member adds payment in any workshop
          |
          v
+-------------------+
| payments          |  (existing table)
+-------------------+
          |
          v
Balance decreases when approved
```

## Technical Details

### Database Migration
```sql
-- Create new table for workshop-independent transfers
CREATE TABLE public.team_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_transfers ENABLE ROW LEVEL SECURITY;

-- Admin can manage all
CREATE POLICY "Admins can manage all team transfers"
  ON public.team_transfers FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Users can view their own
CREATE POLICY "Users can view their own team transfers"
  ON public.team_transfers FOR SELECT
  USING (auth.uid() = user_id);
```

### Balance Calculation Logic (Frontend)
```typescript
// Total received from team_transfers
const totalReceived = teamTransfers.reduce((sum, t) => sum + t.amount, 0);

// Total spent from payments (across all workshops, approved only)
const totalSpent = payments
  .filter(p => p.status === 'approved' && p.created_by === userId)
  .reduce((sum, p) => sum + p.amount, 0);

// Balance
const balance = totalReceived - totalSpent;
```

### What Happens to Existing Data
- The existing `user_transfers` table will remain for historical data
- Migration will NOT transfer data automatically (existing workshop transfers stay as-is)
- New transfers will go to `team_transfers`

## Files to Create
1. `src/pages/Team.tsx` - Team dashboard page
2. `src/components/TeamMemberCard.tsx` - Member summary card
3. `src/components/TeamMemberProfile.tsx` - Detailed member view
4. `src/components/TeamTransferForm.tsx` - Add money form
5. `src/components/TeamTransferHistory.tsx` - Transfer history table
6. `src/components/TeamSpendingHistory.tsx` - Spending history table

## Files to Modify
1. `src/App.tsx` - Add `/team` route
2. `src/components/Layout.tsx` - Add Team nav link for admin
3. `src/components/PaymentForm.tsx` - Remove "Pay Team Member" option
4. `src/components/UserBalanceCard.tsx` - Use team_transfers for balance
5. `src/components/UserIncomeTable.tsx` - Use team_transfers for history

## Summary
This plan creates a clean separation between:
- **Workshop finances**: Income and external payments for each workshop
- **Team finances**: Global money given to team members, tracked across all workshops

Team members will have one global balance that they can spend across any workshop they're assigned to.
