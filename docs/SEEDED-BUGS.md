# Seeded bugs

A passing test suite doesn't prove it would catch anything. So the demo shop can run with 14 planted bugs, modelled on the mistakes real shops make. Each one is switched on by `SEEDED_BUGS` and sits behind a `bug('BUG-xx')` check in the code, so a clean build has none of them.

The nightly runs every test against that broken build and confirms each bug is caught.

## What each bug does, and what catches it

| Bug    | Severity | Area          | What goes wrong                                                                       | Caught by                      |
| ------ | -------- | ------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| BUG-01 | Critical | Payment       | A declined card still books the order                                                 | PAY-02, PAY-03                 |
| BUG-06 | Critical | Subscriptions | A failed renewal leaves the subscription active, so the customer gets coffee for free | SUB-18, SUB-19, SUB-20, SUB-21 |
| BUG-09 | Critical | Security      | A customer can read another customer's order                                          | ACC-04                         |
| BUG-02 | High     | Coupons       | Applying the same coupon twice doubles the discount                                   | CPN-06                         |
| BUG-03 | High     | Cart          | An order of exactly $50.00 misses free shipping                                       | CART-09                        |
| BUG-04 | High     | Cart          | The cart accepts more units than are in stock                                         | CART-05, CAT-12                |
| BUG-05 | High     | Coupons       | An expired coupon is accepted                                                         | CPN-04                         |
| BUG-07 | High     | Subscriptions | Cancelling at period end cancels straight away                                        | SUB-11, SUB-12                 |
| BUG-08 | High     | Subscriptions | An upgrade charges the full new price instead of the prorated difference              | SUB-09                         |
| BUG-13 | High     | Refunds       | A refund can exceed what the customer paid                                            | ADM-05                         |
| BUG-10 | Medium   | Catalogue     | Sort by price compares prices as text, so $129 sorts before $15                       | CAT-04                         |
| BUG-11 | Medium   | Cart          | The cart badge keeps its old count after a line is removed                            | CART-04                        |
| BUG-12 | Medium   | Catalogue     | Gear product pages throw a script error behind a working page                         | CAT-10, CAT-11                 |
| BUG-14 | Medium   | Catalogue     | Product search is case-sensitive                                                      | CAT-07                         |

In total, 21 tests fail and 82 pass. That every failure traces to a planted bug matters as much as the 14 catches: the other 82 tests stayed green, so one bug doesn't drown the report in unrelated failures.

## How the suite catches them

Different bugs need different kinds of checks:

- **Boundary values.** BUG-03 only shows at exactly $50.00, which is why two $25.00 mug sets exist in the test data.
- **Checking the server as well as the screen.** BUG-01 shows the right "declined" message. Only the follow-up check that no order exists finds it.
- **Testing as a second user.** BUG-09 needs two customers, which the `newCustomer` fixture makes easy.
- **Checking arithmetic.** BUG-08 charges successfully. Only the invoice amount shows that it's wrong.
- **Hidden errors.** BUG-12 is invisible on screen. The console guard catches it on every gear page a test visits, which is why two tests fail.
- **Time-based flows.** BUG-06 only appears at renewal, which a test hook triggers on demand.

## Known and unknown

`e2e/reporting/known-defects.json` maps 18 of the 21 failures to their bugs. BUG-12 and BUG-14 are left out on purpose. Their 3 failures show as **New**, which makes the report say DEGRADED and, on GitHub, files an issue for each. Add them to the file and the build reports HEALTHY.

## Try one

To see a single bug caught, start a shop with only that bug, then run the suite in a second terminal.

```bash
SEEDED_BUGS=BUG-08 PORT=4174 TEST_HOOKS=1 node app/server.mjs
```

In Windows PowerShell, use this instead. The settings last until you close that window, so close it when you're done:

```powershell
$env:SEEDED_BUGS='BUG-08'; $env:PORT='4174'; $env:TEST_HOOKS='1'; node app/server.mjs
```

```bash
npm run test:bugs
```

To see how a bug is planted, search the `app/` folder for its ID.
