# Evidence pitfalls

| Claim                                                           | Review response                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unit tests pass, but the seam is a persistence transaction      | Inspect transaction-level evidence; keep AC unverified until that boundary is observed                |
| Logs passed on an earlier commit                                | Establish applicability after intervening changes or rerun the affected check                         |
| One child ticket implements half an AC                          | Judge its contribution; reserve whole-AC PASS for integrated evidence                                 |
| No code defect found and CI was unavailable                     | No confirmed finding, UNVERIFIED for criteria needing missing evidence                                |
| Requirement is not applicable because implementation omitted it | FAIL if evidence contradicts it; otherwise UNVERIFIED; require a sourced scope decision for exclusion |
| The task is a document-only correction                          | Direct content inspection may suffice when it establishes the actual criterion                        |

Manual evidence can be valid. Identify who observed what, against which content and environment, and what remains untested. Do not require a test script merely to imitate a low-impact edit.
