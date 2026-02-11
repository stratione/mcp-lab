# Claude Execution Plans for Multi-Hour Problem Solving

This document describes how to guide Claude through complex, multi-hour coding tasks using structured execution plans. These plans enable Claude to work autonomously on substantial features, refactors, and system changes while maintaining clarity, focus, and verifiable progress.

## Core Philosophy

Claude works best when given:
1. **Clear, self-contained specifications** - All context needed to complete the task
2. **Observable outcomes** - Specific behaviors to verify success
3. **Iterative progress tracking** - Living documentation of what's done and what's next
4. **Autonomous decision-making** - Permission to resolve ambiguities and proceed

## When to Use Execution Plans

Use an execution plan when:
- The task will take multiple hours or sessions to complete
- Multiple files or systems need coordination
- The approach requires design decisions and validation
- The implementation has significant unknowns or research needs
- You want Claude to work autonomously without constant prompting

**Do NOT use** for:
- Simple bug fixes or single-file changes
- Well-understood, routine tasks
- Quick explorations or proof-of-concepts (unless they're milestones in a larger plan)

## Quick Start: Activating Execution Plans

To have Claude create and follow an execution plan:

1. **Request a plan**: "Create an execution plan for [task description]"
2. **Review and approve**: Claude will generate the plan structure first
3. **Execute**: "Implement the plan" or "Begin milestone 1"
4. **Monitor**: Check progress updates in the plan's Progress section
5. **Resume**: "Continue the plan" works across sessions

## Execution Plan Structure

Every execution plan must include these sections:

### Required Sections

**Purpose / Big Picture**
- What user-visible capability this enables
- How to observe it working
- Why this matters (2-3 sentences max)

**Progress** (Living section)
- Checkbox list of granular steps
- Timestamps for each completed item
- Split partially-completed items into done/remaining

**Surprises & Discoveries** (Living section)
- Unexpected behaviors found during implementation
- Performance characteristics discovered
- Bugs or edge cases encountered
- Include brief evidence (test output, error messages)

**Decision Log** (Living section)
- Every design decision made during implementation
- Format: Decision → Rationale → Date
- Why alternatives were rejected

**Outcomes & Retrospective** (Living section)
- Summary at major milestones or completion
- What was achieved vs. originally planned
- Lessons learned for future work

**Context and Orientation**
- Current state of the codebase relevant to this task
- Key files with full repository paths
- Define all technical terms and jargon
- How components fit together

**Plan of Work**
- Narrative description of the approach
- Sequence of changes in logical order
- Files to create/modify with specific locations

**Concrete Steps**
- Exact commands to run
- Working directory for each command
- Expected output for verification

**Validation and Acceptance**
- How to demonstrate the feature works
- Specific inputs and expected outputs
- Test commands and success criteria
- Observable behavior, not just code changes

**Idempotence and Recovery**
- Steps that can be safely repeated
- How to recover from partial completion
- Rollback procedures if needed

### Optional Sections

**Milestones** (for multi-phase work)
- Break work into independently verifiable chunks
- Each milestone has: goal → work → result → proof
- Enables incremental progress validation

**Prototyping Milestones**
- Explicit proof-of-concept phases
- De-risk challenging technical decisions
- Validate library capabilities before full integration

**Interfaces and Dependencies**
- Specific function signatures to implement
- Type definitions and interfaces
- Library versions and why they were chosen

## How Claude Should Use This Guide

### When Creating a Plan

1. **Read CLAUDE.md completely** before starting
2. **Start from the skeleton** at the end of this document
3. **Research thoroughly** - read source code, documentation, existing implementations
4. **Be comprehensive** - include everything a complete novice would need
5. **Define all terms** - don't assume knowledge of the codebase
6. **Make it self-contained** - no references to external docs or prior context

### When Implementing a Plan

1. **Don't prompt for next steps** - proceed autonomously to the next milestone
2. **Update all sections** as you progress:
   - Mark items complete in Progress with timestamps
   - Split partially-done items into done/remaining
   - Add discoveries to Surprises & Discoveries
   - Log all design decisions in Decision Log
3. **Resolve ambiguities independently** - document the decision and rationale
4. **Commit frequently** with clear messages referencing the plan
5. **Validate at every milestone** - don't move on until success is proven

### When Discussing a Plan

1. **Record all decisions** in the Decision Log
2. **Update the plan immediately** when direction changes
3. **Keep it self-contained** - incorporate feedback into the plan itself
4. **Maintain restartability** - the plan alone should enable continuing work

## Critical Requirements (Non-Negotiable)

✓ **Self-Contained**: The plan contains ALL knowledge needed. No external references.

✓ **Living Document**: Updated continuously as work progresses. Always current.

✓ **Novice-Friendly**: Someone unfamiliar with the repo can follow it successfully.

✓ **Behavior-Focused**: Defines observable outcomes, not just code changes.

✓ **Plain Language**: All technical terms defined. No unexplained jargon.

✓ **Demonstrable**: Produces working functionality that can be seen/tested.

## Common Failure Modes to Avoid

❌ **Undefined Jargon**: Using terms like "middleware" or "RPC gateway" without explanation
❌ **Letter-of-Feature**: Code compiles but doesn't actually do anything useful
❌ **Outsourcing Decisions**: Leaving ambiguous choices for "the reader" to figure out
❌ **Compilation-Only Success**: "It builds" instead of "it works and here's how to see it"
❌ **External Dependencies**: Pointing to docs/blogs instead of embedding the knowledge
❌ **Assuming Context**: Relying on "as mentioned earlier" or prior knowledge

## Formatting Rules

**File Format**
- Single markdown file named descriptively (e.g., `plan_instagram_integration.md`)
- Use standard markdown: `#` for headings, `-` for lists, indented code blocks
- No nested code fences - use indentation for command examples
- Two newlines after every heading

**Code and Commands**
- Show commands as indented blocks with `$` prompt
- Include expected output
- Specify working directory

Example:
```
From the project root:

    $ npm test
    
    Expected output:
    ✓ Instagram API connection (234ms)
    ✓ Feed parsing handles empty results (45ms)
    
    Tests: 2 passed, 2 total
```

**Progress Format**
```
## Progress

- [x] (2025-02-10 14:30Z) Created Instagram service module with authentication
- [x] (2025-02-10 15:15Z) Implemented feed fetching with pagination
- [ ] Add error handling for rate limits
- [ ] Write integration tests (started: test setup complete; remaining: actual test cases)
```

## Working Across Sessions

Claude's execution plans are designed for resumability:

**To Resume Work**:
- "Continue the execution plan"
- "What's the next step in the plan?"
- "Implement milestone 3"

**Claude Will**:
- Read the current plan state
- Check Progress section for what's done
- Continue from the next uncompleted item
- Update all living sections as work proceeds

**Before Ending a Session**:
Claude should update:
- Progress with current status and timestamps
- Any discoveries made
- Any decisions that changed the approach
- Clear indication of what's next

## Prototyping and Validation

When facing unknowns, include prototyping milestones:

**Prototyping Milestone Example**:
```
### Milestone 2: Validate Instagram API Rate Limits (Prototype)

Purpose: Confirm that Instagram's API rate limits work as documented and
that our caching strategy will keep us within limits.

Approach:
1. Create a throwaway test script that hammers the API
2. Measure actual rate limit behavior
3. Determine optimal cache TTL
4. Document findings for the real implementation

Acceptance: A script that proves our understanding and a documented
conclusion about cache strategy.
```

**Guidelines**:
- Clearly label prototypes vs. production code
- Describe how to run and interpret results
- State what you're learning and why
- Determine next steps based on findings

## Integration with Claude's Computer Use

When the plan involves:
- **File operations**: Use `create_file`, `str_replace`, `view` tools
- **Command execution**: Use `bash_tool` with clear descriptions
- **Validation**: Run tests, start servers, make HTTP requests
- **Verification**: Take screenshots, check browser state, read logs

Claude should:
1. Follow the plan's Concrete Steps exactly
2. Capture command output in Progress updates
3. Screenshot/verify user-visible behavior
4. Update Validation sections with actual results

## Skeleton Template

```markdown
# [Short Action-Oriented Title]

This is a living execution plan following CLAUDE.md guidelines. All sections
marked (Living) must be kept up to date as work proceeds.

Reference: This plan follows the guidelines in `.agent/CLAUDE.md`

## Purpose / Big Picture

[What capability this enables for users. How they'll see it working. Why it matters. 2-3 sentences.]

## Progress (Living)

- [ ] [First concrete step]
- [ ] [Second concrete step]

## Surprises & Discoveries (Living)

_None yet. Will be updated as implementation proceeds._

## Decision Log (Living)

_Decisions will be logged here as they are made._

## Outcomes & Retrospective (Living)

_Will be completed at milestone completion and plan completion._

## Context and Orientation

[Current state of relevant code. Key files with full paths. Definition of any
technical terms. How the pieces fit together.]

## Plan of Work

[Narrative description of the approach. Sequence of changes. Files to touch
and why. Keep it concrete but not overly prescriptive on details.]

## Concrete Steps

[Exact commands to run, working directories, expected outputs. Format as
executable instructions.]

## Validation and Acceptance

[How to demonstrate it works. Specific commands and expected behavior.
What the user can do that they couldn't before.]

## Idempotence and Recovery

[Steps that can be repeated safely. How to retry if something fails partway.
Rollback procedures if needed.]

## Milestones (if applicable)

### Milestone 1: [Name]

[Goal, approach, acceptance criteria, verification steps.]

### Milestone 2: [Name]

[Goal, approach, acceptance criteria, verification steps.]

## Interfaces and Dependencies (if applicable)

[Specific function signatures, types, modules. Library versions and rationale.]
```

## Examples of Good vs. Bad Plans

### ❌ Bad: Vague and Dependent on External Knowledge

```
## Plan

1. Add Instagram integration
2. Update the UI
3. Deploy

## Acceptance

The Instagram feed should work.
```

Problems:
- No specifics about what "Instagram integration" means
- Assumes knowledge of what UI changes are needed
- No verification steps
- Can't tell if it's working or not

### ✅ Good: Specific and Self-Contained

```
## Plan of Work

We will add Instagram feed integration to the homepage. This involves:

1. Create a new service module at `src/services/instagram.ts` that:
   - Authenticates with Instagram Basic Display API using OAuth
   - Fetches the user's recent posts (media endpoint)
   - Caches results for 1 hour to respect rate limits
   - Returns an array of post objects with image URL, caption, permalink

2. Add a new React component at `src/components/InstagramFeed.tsx` that:
   - Calls the Instagram service
   - Displays posts in a 3-column grid on desktop, 1-column on mobile
   - Shows loading state during fetch
   - Handles errors gracefully with user-friendly message

3. Integrate into homepage by importing InstagramFeed in `src/pages/Home.tsx`
   and rendering it below the hero section

## Concrete Steps

From project root:

    $ npm install instagram-basic-display-api
    $ npm run dev

Navigate to http://localhost:3000 and verify:
- Instagram feed appears below hero section
- Shows 9 most recent posts in grid layout
- Each post is clickable and opens Instagram in new tab
- On mobile viewport (< 768px), displays single column

## Validation and Acceptance

After implementation:

1. Start dev server: `npm run dev`
2. Open browser to http://localhost:3000
3. Observe: Instagram feed section with recent posts
4. Click any post: Opens Instagram post in new tab
5. Resize browser to mobile width: Grid becomes single column
6. Run tests: `npm test -- instagram`
   Expected: All tests pass including authentication, fetching, caching, error handling
```

Why this is good:
- Specific file paths and function purposes
- Clear technical approach with implementation details
- Executable verification steps
- Observable outcomes defined
- Dependencies specified with versions

## Summary: How to Get the Best Results from Claude

1. **Request an execution plan** for complex multi-hour tasks
2. **Review the plan** before Claude begins implementation
3. **Let Claude work autonomously** - it will update progress and make decisions
4. **Check Progress section** periodically to monitor status
5. **Resume across sessions** with "Continue the execution plan"
6. **Trust the living documentation** - it reflects current reality

The execution plan becomes your source of truth. It documents not just what was done, but why decisions were made, what was discovered, and how to verify success. This makes the work reviewable, resumable, and reproducible.

---

**For Claude**: When you see "Create an execution plan for [task]", begin by reading this entire document, then generate a plan using the skeleton template. Fill every section thoroughly. Make it self-contained. Then ask for approval before implementation.
