import {
  DocumentItem,
  Workspace,
  Conversation,
  Quiz,
  FlashcardDeck,
  WeakTopic,
  SkillGapAnalysis,
  BulletRewriteItem,
  RoadmapMilestone,
  MockInterviewQuestion,
  RAGEvalMetric,
  RAGEvalTestCase,
  MemoryFact,
  UserProfile,
} from '../types';

export const MOCK_USER: UserProfile = {
  id: 'usr_1',
  email: 'alex.chen@university.edu',
  name: 'Alex Chen',
  role: 'Computer Science & Software Engineer Candidate',
  goal: 'Ace Distributed Systems Finals & Land Backend Engineer Offer',
  streakDays: 14,
  preferredLanguage: 'en',
  defaultModel: 'groq-llama',
  defaultExplanationLevel: 'student',
  hybridSearchEnabled: true,
  rerankerEnabled: true,
  topK: 5,
  memoryEnabled: true,
};

export const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 'ws_core',
    name: 'CS Core & Distributed Systems',
    description: 'DBMS, Operating Systems, Networking & Cloud Architecture',
    color: '#10B981',
    emoji: '💾',
    documentCount: 3,
    deckCount: 3,
    quizCount: 4,
    createdAt: '2026-09-01T08:00:00Z',
  },
  {
    id: 'ws_career',
    name: 'Tech Career & Interview Prep',
    description: 'Resumes, JD gap analyses, System Design & Behavioral prep',
    color: '#6366F1',
    emoji: '🚀',
    documentCount: 2,
    deckCount: 1,
    quizCount: 2,
    createdAt: '2026-09-15T10:00:00Z',
  },
];

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_dbms',
    workspaceId: 'ws_core',
    name: 'DBMS Notes - Transactions & Concurrency.pdf',
    type: 'pdf',
    sizeBytes: 4820000,
    pageCount: 28,
    chunkCount: 142,
    status: 'ready',
    progressPercent: 100,
    createdAt: '2026-09-10T14:20:00Z',
    contentSample: `Chapter 7: Concurrency Control & Two-Phase Locking (2PL)
Transactions must satisfy the ACID properties: Atomicity, Consistency, Isolation, and Durability.
In multi-user DBMS environments, the Isolation property is strictly enforced using concurrency control protocols.

Section 7.3: Two-Phase Locking (2PL) Protocol:
A transaction is said to follow the Two-Phase Locking protocol if all locking operations precede the first unlock operation in the transaction.
1. Growing Phase: The transaction may acquire locks of any type (Shared or Exclusive), but cannot release any lock.
2. Shrinking Phase: The transaction may release locks, but cannot obtain any new locks.

Strict 2PL:
Strict 2PL additionally requires that all Exclusive (X) locks held by a transaction must be released only after the transaction commits or aborts. This guarantees strict schedules that prevent cascading rollbacks and avoid dirty reads.

Section 7.8: Deadlock Detection & Prevention:
Deadlocks occur when transactions wait in a cyclic dependency for resources held by each other. Techniques include Wait-Die and Wound-Wait schemes based on transaction timestamps, as well as cycle detection in the Wait-For Graph (WFG).`,
    chunks: [
      {
        id: 'chunk_dbms_1',
        documentId: 'doc_dbms',
        pageNumber: 14,
        text: 'A transaction follows Two-Phase Locking (2PL) if all lock acquisitions precede any lock release. In the growing phase, locks are acquired; in the shrinking phase, locks are released. Strict 2PL holds exclusive locks until commit.',
        bm25Score: 8.92,
        vectorScore: 0.89,
        rrfScore: 0.032,
        rerankScore: 0.96,
      },
      {
        id: 'chunk_dbms_2',
        documentId: 'doc_dbms',
        pageNumber: 18,
        text: 'Deadlock detection in DBMS: Periodically inspect the Wait-For Graph (WFG). If a cycle exists, select a victim transaction with minimum rollback cost to abort.',
        bm25Score: 7.45,
        vectorScore: 0.82,
        rrfScore: 0.028,
        rerankScore: 0.88,
      },
      {
        id: 'chunk_dbms_3',
        documentId: 'doc_dbms',
        pageNumber: 22,
        text: 'ACID guarantees: Durability requires write-ahead logging (WAL) using the ARIES recovery algorithm. Changes are appended to non-volatile log buffers prior to disk flush.',
        bm25Score: 8.11,
        vectorScore: 0.85,
        rrfScore: 0.030,
        rerankScore: 0.91,
      },
    ],
  },
  {
    id: 'doc_os',
    workspaceId: 'ws_core',
    name: 'Operating Systems - Memory & Paging.pdf',
    type: 'pdf',
    sizeBytes: 6100000,
    pageCount: 36,
    chunkCount: 185,
    status: 'ready',
    progressPercent: 100,
    createdAt: '2026-09-12T09:15:00Z',
    contentSample: `Chapter 9: Virtual Memory & Page Replacement Algorithms
Virtual memory decouples the logical address space from physical memory. The Translation Lookaside Buffer (TLB) provides high-speed hardware caching for virtual-to-physical address mappings.

When a process requests an address not currently mapped in physical RAM, the MMU signals a Page Fault trap:
1. CPU traps to kernel mode.
2. The OS inspects the internal page table to verify valid authorization.
3. If valid, an empty physical frame is located (or a victim page is evicted using LRU, Clock, or FIFO).
4. Disk I/O reads the required page into physical memory.
5. Page table and TLB are updated, and the faulting instruction is restarted.

Belady's Anomaly:
For certain page replacement policies like FIFO, increasing physical page frames can paradoxically increase the number of page faults. Stack algorithms like LRU never suffer from Belady's Anomaly.`,
    chunks: [
      {
        id: 'chunk_os_1',
        documentId: 'doc_os',
        pageNumber: 8,
        text: 'Page Fault Sequence: 1. CPU traps to OS. 2. Verify page table entry. 3. Find physical frame via page replacement. 4. Disk transfer into frame. 5. Update TLB and restart CPU instruction.',
        bm25Score: 9.15,
        vectorScore: 0.91,
        rrfScore: 0.034,
        rerankScore: 0.98,
      },
      {
        id: 'chunk_os_2',
        documentId: 'doc_os',
        pageNumber: 19,
        text: 'Beladys Anomaly: FIFO replacement can cause higher page fault frequency as frame allocation increases. LRU is immune because it is a stack algorithm.',
        bm25Score: 7.82,
        vectorScore: 0.84,
        rrfScore: 0.029,
        rerankScore: 0.90,
      },
    ],
  },
  {
    id: 'doc_youtube',
    workspaceId: 'ws_core',
    name: 'Raft Consensus & Distributed Log Replication',
    type: 'youtube',
    sizeBytes: 1200000,
    durationSeconds: 1940,
    chunkCount: 64,
    status: 'ready',
    progressPercent: 100,
    url: 'https://www.youtube.com/watch?v=vYp4LYbnnW8',
    thumbnailUrl: 'https://img.youtube.com/vi/vYp4LYbnnW8/hqdefault.jpg',
    createdAt: '2026-09-14T11:45:00Z',
    contentSample: `[02:15] Raft decomposes consensus into 3 independent subproblems: Leader Election, Log Replication, and Safety.
[05:40] Leader Election: When a follower detects heartbeat timeout (150ms-300ms randomized), it transitions to candidate, increments term, and broadcasts RequestVote.
[12:10] Log Replication: The elected leader accepts client proposals, appends entries to its log, and issues AppendEntries RPCs to all peers.
[18:30] Safety Invariant: Once an entry from the current term is committed by a majority of servers, it is guaranteed to appear in all subsequent leaders' logs.`,
    chunks: [
      {
        id: 'chunk_yt_1',
        documentId: 'doc_youtube',
        timestamp: '05:40',
        text: 'Raft leader election uses randomized election timers (150-300ms) to prevent split votes. A candidate needs majority votes to become leader.',
        bm25Score: 8.65,
        vectorScore: 0.88,
        rrfScore: 0.031,
        rerankScore: 0.94,
      },
    ],
  },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_dbms_en',
    workspaceId: 'ws_core',
    title: 'Strict 2PL vs 2-Phase Commit Protocol',
    documentScope: 'all',
    explanationLevel: 'student',
    answerLanguage: 'en',
    model: 'groq-llama',
    createdAt: '2026-10-08T14:00:00Z',
    updatedAt: '2026-10-08T14:05:00Z',
    messages: [
      {
        id: 'msg_1',
        conversationId: 'conv_dbms_en',
        role: 'user',
        content: 'What is the key difference between Strict Two-Phase Locking (Strict 2PL) and Two-Phase Commit (2PC)?',
        createdAt: '2026-10-08T14:00:00Z',
      },
      {
        id: 'msg_2',
        conversationId: 'conv_dbms_en',
        role: 'assistant',
        content: `**Strict 2PL** and **Two-Phase Commit (2PC)** solve entirely different challenges in database engineering, despite both having "Two-Phase" in their names:

1. **Strict Two-Phase Locking (Strict 2PL) [1]**:
   - **Domain**: Single-node Concurrency Control.
   - **Goal**: Guarantees conflict serializability and prevents cascading aborts.
   - **Mechanism**: The transaction acquires locks during its growing phase and releases *only* after commit/abort. This ensures no other transaction can read uncommitted dirty writes.

2. **Two-Phase Commit (2PC) [2]**:
   - **Domain**: Distributed Transaction Atomicity across multiple network nodes.
   - **Goal**: Guarantees all distributed participants either all commit or all rollback together.
   - **Mechanism**: A Coordinator coordinates a **Prepare Phase** (voting) followed by a **Commit/Abort Phase** across distributed nodes.

| Feature | Strict 2PL | 2-Phase Commit (2PC) |
| :--- | :--- | :--- |
| **Problem Solved** | Concurrency & Serializability | Distributed Atomicity |
| **Scope** | Locks on local data items | Network agreement across nodes |
| **Failure Handled** | Dirty reads & conflicting writes | Network partitions & node crashes |`,
        createdAt: '2026-10-08T14:00:15Z',
        citations: [
          {
            id: 'cit_1',
            documentId: 'doc_dbms',
            documentName: 'DBMS Notes - Transactions & Concurrency.pdf',
            pageNumber: 14,
            snippet: 'Strict 2PL requires all Exclusive (X) locks to be held until the transaction explicitly commits or aborts, eliminating cascading rollbacks.',
            confidence: 0.96,
          },
          {
            id: 'cit_2',
            documentId: 'doc_dbms',
            documentName: 'DBMS Notes - Transactions & Concurrency.pdf',
            pageNumber: 22,
            snippet: 'In distributed transaction management, 2PC ensures atomic commitment across independent participating cohorts via prepare and commit phases.',
            confidence: 0.94,
          },
        ],
        confidenceScore: 96,
        confidenceTier: 'high',
        usedMemory: true,
        explanationLevel: 'student',
        reasoningTrace: [
          {
            agent: 'Planner',
            durationMs: 120,
            status: 'completed',
            outputSnippet: 'Decomposed comparison into concurrency control (Strict 2PL) vs distributed atomicity consensus (2PC).',
            subQueries: ['Strict 2PL concurrency definition', 'Two-phase commit distributed protocol'],
          },
          {
            agent: 'Retriever',
            durationMs: 240,
            status: 'completed',
            outputSnippet: 'Retrieved 4 chunks from DBMS Notes.pdf with top cross-encoder scores > 0.90.',
          },
          {
            agent: 'Answerer',
            durationMs: 380,
            status: 'completed',
            outputSnippet: 'Synthesized side-by-side contrast with clear markdown matrix and citations.',
          },
          {
            agent: 'Critic',
            durationMs: 110,
            status: 'completed',
            outputSnippet: 'Hallucination check passed: all definitions grounded in Section 7.3 & Section 8.1.',
            criticVerdict: {
              passed: true,
              hallucinationDetected: false,
              note: 'Verified that all statements are grounded in cited document chunks.',
            },
          },
        ],
        retrievalInspection: [
          {
            chunkId: 'chunk_dbms_1',
            docName: 'DBMS Notes.pdf',
            pageOrTime: 'p. 14',
            snippet: 'Strict 2PL requires all Exclusive locks to be held until commit, eliminating cascading rollbacks.',
            bm25Score: 8.92,
            vectorScore: 0.89,
            fusedRank: 1,
            rerankerScore: 0.96,
            initialRank: 2,
            finalRank: 1,
          },
          {
            chunkId: 'chunk_dbms_3',
            docName: 'DBMS Notes.pdf',
            pageOrTime: 'p. 22',
            snippet: 'Distributed commit requires two phases: prepare phase vote and coordinator commit.',
            bm25Score: 8.11,
            vectorScore: 0.85,
            fusedRank: 2,
            rerankerScore: 0.91,
            initialRank: 1,
            finalRank: 2,
          },
        ],
      },
    ],
  },
  {
    id: 'conv_dbms_ta',
    workspaceId: 'ws_core',
    title: 'DBMS-ல் ACID பண்புகள் விளக்கம்',
    documentScope: 'all',
    explanationLevel: 'student',
    answerLanguage: 'ta',
    model: 'groq-llama',
    createdAt: '2026-10-09T10:00:00Z',
    updatedAt: '2026-10-09T10:03:00Z',
    messages: [
      {
        id: 'msg_ta_1',
        conversationId: 'conv_dbms_ta',
        role: 'user',
        content: 'DBMS-ல் ACID பண்புகள் என்றால் என்ன? சுருக்கமாக விளக்குங்கள்.',
        createdAt: '2026-10-09T10:00:00Z',
      },
      {
        id: 'msg_ta_2',
        conversationId: 'conv_dbms_ta',
        role: 'assistant',
        content: `DBMS-ல் **ACID பண்புகள் [1]** என்பது தரவுத்தள பரிவர்த்தனைகளின் நம்பகத்தன்மையை உறுதி செய்யும் நான்கு முக்கிய விதிகளாகும்:

1. **Atomicity (முழுமைத்தன்மை)**:
   - ஒரு பரிவர்த்தனை முழுவதும் வெற்றிகரமாக நடக்க வேண்டும் அல்லது எதுவுமே நடக்காமல் ரத்து செய்யப்பட வேண்டும் ("All or Nothing").

2. **Consistency (நிலைத்தன்மை)**:
   - பரிவர்த்தனைக்கு முன்னும் பின்னும் தரவுத்தளம் அனைத்து பாதுகாப்பு விதிகளுக்கும் உட்பட்டு சீராக இருக்க வேண்டும்.

3. **Isolation (தனிமைப்படுத்தல்) [2]**:
   - ஒரே நேரத்தில் பல பரிவர்த்தனைகள் நடந்தாலும், அவை ஒன்றையொன்று பாதிக்காமல் தனித்தனியாக இயங்க வேண்டும் (2PL புரோட்டோகால் மூலம் செயல்படுத்தப்படுகிறது).

4. **Durability (நீடித்த தன்மை)**:
   - ஒருமுறை பரிவர்த்தனை உறுதியானால் (Commit), கணினி செயலிழந்தாலும் தரவு நிரந்தரமாக சேமிக்கப்பட்டிருக்கும்.`,
        createdAt: '2026-10-09T10:00:18Z',
        citations: [
          {
            id: 'cit_ta_1',
            documentId: 'doc_dbms',
            documentName: 'DBMS Notes - Transactions & Concurrency.pdf',
            pageNumber: 14,
            snippet: 'Transactions must satisfy the ACID properties: Atomicity, Consistency, Isolation, and Durability.',
            confidence: 0.98,
          },
          {
            id: 'cit_ta_2',
            documentId: 'doc_dbms',
            documentName: 'DBMS Notes - Transactions & Concurrency.pdf',
            pageNumber: 16,
            snippet: 'Isolation is enforced through Two-Phase Locking to prevent dirty reads.',
            confidence: 0.94,
          },
        ],
        confidenceScore: 97,
        confidenceTier: 'high',
        usedMemory: true,
        explanationLevel: 'student',
        reasoningTrace: [
          {
            agent: 'Planner',
            durationMs: 95,
            status: 'completed',
            outputSnippet: 'தமிழ் மொழியில் ACID கோட்பாடுகளை வரிசைப்படுத்தியது.',
          },
          {
            agent: 'Retriever',
            durationMs: 180,
            status: 'completed',
            outputSnippet: 'DBMS Notes ஆவணத்திலிருந்து ACID குறிப்புகள் மீட்டெடுக்கப்பட்டன.',
          },
          {
            agent: 'Answerer',
            durationMs: 290,
            status: 'completed',
            outputSnippet: 'தூய தமிழ் கலைச்சொற்களுடன் துல்லியமான விளக்கம் உருவாக்கப்பட்டது.',
          },
          {
            agent: 'Critic',
            durationMs: 80,
            status: 'completed',
            outputSnippet: 'உண்மைத்தன்மை சரிபார்க்கப்பட்டது: 100% நம்பகத்தன்மை.',
          },
        ],
      },
    ],
  },
];

export const MOCK_QUIZZES: Quiz[] = [
  {
    id: 'quiz_1',
    workspaceId: 'ws_core',
    title: 'DBMS Concurrency & Lock Protocols',
    topic: 'Database Concurrency Control',
    difficulty: 'medium',
    timedMinutes: 10,
    completedAt: '2026-10-05T16:30:00Z',
    scorePercent: 80,
    questions: [
      {
        id: 'q_1',
        type: 'mcq',
        prompt: 'Under Strict Two-Phase Locking (Strict 2PL), when are Exclusive (X) locks released?',
        options: [
          'Immediately after the data item is modified',
          'At the start of the shrinking phase',
          'Only after the transaction explicitly commits or aborts',
          'Whenever another transaction requests a Shared lock',
        ],
        correctAnswer: 2,
        explanation: 'Strict 2PL mandates holding all exclusive write locks until the transaction terminates (commit or abort), preventing cascading rollbacks.',
        citation: {
          id: 'cit_q1',
          documentId: 'doc_dbms',
          documentName: 'DBMS Notes.pdf',
          pageNumber: 14,
          snippet: 'Strict 2PL requires exclusive locks to be held until commit.',
          confidence: 0.98,
        },
        topic: 'Two-Phase Locking',
      },
      {
        id: 'q_2',
        type: 'true_false',
        prompt: 'True or False: The Wait-For Graph (WFG) cycle detection algorithm is used to prevent deadlocks rather than detect them.',
        options: ['True', 'False'],
        correctAnswer: 1,
        explanation: 'False. A Wait-For Graph (WFG) detects deadlocks that have already occurred by searching for directed cycles. Timestamp schemes like Wait-Die prevent them.',
        topic: 'Deadlocks',
      },
      {
        id: 'q_3',
        type: 'mcq',
        prompt: 'Which page replacement policy is susceptible to Belady’s Anomaly?',
        options: ['Least Recently Used (LRU)', 'Optimal (OPT)', 'First-In First-Out (FIFO)', 'Least Frequently Used (LFU)'],
        correctAnswer: 2,
        explanation: 'FIFO is prone to Beladys anomaly where adding page frames can cause more page faults. LRU and OPT are stack algorithms and immune.',
        topic: 'Virtual Memory',
      },
      {
        id: 'q_4',
        type: 'short_answer',
        prompt: 'What hardware cache is checked first by the MMU during virtual address translation before walking the page table?',
        correctAnswer: 'TLB',
        explanation: 'The Translation Lookaside Buffer (TLB) caches recent virtual-to-physical address mappings for fast single-cycle translation.',
        topic: 'Memory Management',
      },
      {
        id: 'q_5',
        type: 'mcq',
        prompt: 'In the Raft consensus algorithm, what prevents split votes during candidate election?',
        options: [
          'Fixed priority IDs assigned to servers',
          'Randomized election timeouts (150ms-300ms)',
          'Centralized token ring pass',
          'Immediate abort upon receiving duplicate votes',
        ],
        correctAnswer: 1,
        explanation: 'Randomized election timeouts ensure candidates timeout at different intervals, letting one candidate solicit majority votes before others start.',
        topic: 'Distributed Consensus',
      },
    ],
  },
];

export const MOCK_FLASHCARD_DECKS: FlashcardDeck[] = [
  {
    id: 'deck_dbms',
    workspaceId: 'ws_core',
    title: 'DBMS Transactions & Locking Mastery',
    description: 'ACID, Strict 2PL, Timestamp ordering, and Recovery protocols',
    cardCount: 16,
    dueCount: 4,
    createdAt: '2026-09-18T10:00:00Z',
    cards: [
      {
        id: 'card_1',
        deckId: 'deck_dbms',
        front: 'What are the two distinct phases in the Two-Phase Locking (2PL) protocol?',
        back: '1. Growing Phase: Locks can be acquired, but none can be released.\n2. Shrinking Phase: Locks can be released, but no new locks can be acquired.',
        sm2: { repetition: 2, interval: 6, easeFactor: 2.5 },
        dueDate: '2026-10-10T00:00:00Z',
        topic: 'Concurrency',
      },
      {
        id: 'card_2',
        deckId: 'deck_dbms',
        front: 'Why does Strict 2PL prevent cascading aborts?',
        back: 'Because exclusive (X) locks are retained until commit/abort, ensuring uncommitted dirty data is never read by concurrent transactions.',
        sm2: { repetition: 1, interval: 1, easeFactor: 2.36 },
        dueDate: '2026-10-10T00:00:00Z',
        topic: 'Concurrency',
      },
      {
        id: 'card_3',
        deckId: 'deck_dbms',
        front: 'Explain the difference between Wait-Die and Wound-Wait schemes.',
        back: 'Wait-Die: Non-preemptive. If older requests younger resource, older waits; if younger requests older, younger dies.\nWound-Wait: Preemptive. If older requests younger resource, older wounds (preempts) younger; if younger requests older, younger waits.',
        sm2: { repetition: 3, interval: 14, easeFactor: 2.6 },
        dueDate: '2026-10-18T00:00:00Z',
        topic: 'Deadlocks',
      },
      {
        id: 'card_4',
        deckId: 'deck_dbms',
        front: 'What is the Write-Ahead Logging (WAL) protocol rule?',
        back: 'All log records describing an update must be written to stable storage BEFORE the corresponding dirty page is flushed to disk.',
        sm2: { repetition: 0, interval: 1, easeFactor: 2.5 },
        dueDate: '2026-10-10T00:00:00Z',
        topic: 'Recovery',
      },
    ],
  },
  {
    id: 'deck_os',
    workspaceId: 'ws_core',
    title: 'Operating Systems - Paging & Virtual Memory',
    description: 'TLB, Page faults, Replacement algorithms, and Belady anomaly',
    cardCount: 14,
    dueCount: 2,
    createdAt: '2026-09-20T12:00:00Z',
    cards: [
      {
        id: 'card_os_1',
        deckId: 'deck_os',
        front: 'What is Belady\'s Anomaly and which algorithm exhibits it?',
        back: 'Belady\'s Anomaly occurs when adding physical memory page frames increases page fault rate. FIFO exhibits this behavior. Stack algorithms like LRU never suffer from it.',
        sm2: { repetition: 2, interval: 6, easeFactor: 2.5 },
        dueDate: '2026-10-10T00:00:00Z',
        topic: 'Paging',
      },
    ],
  },
];

export const MOCK_WEAK_TOPICS: WeakTopic[] = [
  {
    id: 'wt_1',
    workspaceId: 'ws_core',
    name: 'Wait-Die vs Wound-Wait Deadlock Schemes',
    category: 'DBMS Concurrency',
    accuracyPercent: 54,
    trend: 'declining',
    lastPracticed: '2026-10-06T15:00:00Z',
    suggestedAction: 'quiz',
  },
  {
    id: 'wt_2',
    workspaceId: 'ws_core',
    name: 'Belady\'s Anomaly in Page Replacement',
    category: 'Operating Systems',
    accuracyPercent: 62,
    trend: 'stagnant',
    lastPracticed: '2026-10-07T11:30:00Z',
    suggestedAction: 'flashcards',
    flashcardDeckId: 'deck_os',
  },
  {
    id: 'wt_3',
    workspaceId: 'ws_core',
    name: 'Raft Log Invariants & Split-Brain Prevention',
    category: 'Distributed Systems',
    accuracyPercent: 68,
    trend: 'improving',
    lastPracticed: '2026-10-08T18:20:00Z',
    suggestedAction: 'explain',
  },
];

export const MOCK_CAREER_ANALYSIS: SkillGapAnalysis = {
  id: 'c_analysis_1',
  jobTitle: 'Backend Engineer (Distributed Systems)',
  companyName: 'Stripe / Datadog',
  overallMatchScore: 82,
  matchedSkills: [
    { name: 'Python & Go Backend Services', evidence: 'Built high-throughput REST & gRPC endpoints in production' },
    { name: 'PostgreSQL & Relational Data Modeling', evidence: 'Optimized B-tree indexing and transaction isolation levels' },
    { name: 'Docker & Containerization', evidence: 'Containerized multi-service development stacks' },
    { name: 'Concurrency & Multi-threading', evidence: 'Demonstrated in CS coursework projects with lock-free queues' },
  ],
  partialSkills: [
    { name: 'Kafka & Event-Driven Architecture', gap: 'Basic pub/sub familiarity, needs practical consumer group offset handling' },
    { name: 'Kubernetes Deployment & Helm', gap: 'Experience running Docker Compose, needs k8s manifests & ingress config' },
  ],
  missingSkills: [
    { name: 'Distributed Consensus (Raft/Paxos)', priority: 'high', recommendedResource: 'MIT 6.824 Raft Lab & Notes' },
    { name: 'Redis Distributed Caching Patterns', priority: 'medium', recommendedResource: 'Cache-aside & stampede prevention guide' },
  ],
  atsChecklist: [
    { item: 'Clear Technical Skills Hierarchy', passed: true, tip: 'Languages, Databases, and Infrastructure well segregated.' },
    { item: 'Quantified Business / Latency Metrics', passed: false, tip: '3 bullet points lack concrete percentages or millisecond improvements.' },
    { item: 'Action Verbs in Header Sentences', passed: true, tip: 'Strong active verbs: Engineered, Reduced, Architected.' },
    { item: 'Standard Section Headers for ATS Parsing', passed: true, tip: 'Standard Experience, Education, and Skills tags.' },
  ],
  resumeScoreBreakdown: {
    impact: 78,
    clarity: 90,
    keywords: 84,
    formatting: 92,
    quantification: 66,
  },
  sectionSuggestions: [
    { section: 'Experience', suggestion: 'Quantify database optimization: instead of "improved query speed", specify "reduced P99 query latency from 320ms to 48ms".' },
    { section: 'Projects', suggestion: 'Highlight Raft consensus implementation to directly address the backend engineer requirements.' },
  ],
};

export const MOCK_BULLET_REWRITES: BulletRewriteItem[] = [
  {
    id: 'br_1',
    original: 'Worked on database queries and made them faster for the web app.',
    improved: 'Optimized PostgreSQL queries by restructuring composite B-Tree indexes, reducing P99 latency by 58% (340ms to 142ms) across 2.4M daily requests.',
    diffSummary: '+ composite indexes, + P99 latency 58%, + 2.4M volume',
    quantificationScore: 94,
    metricAdded: '58% latency reduction across 2.4M requests',
  },
  {
    id: 'br_2',
    original: 'Built backend services using Go and microservices architecture.',
    improved: 'Architected 4 distributed Go microservices communicating via gRPC and Protocol Buffers, sustaining 12,000 QPS with zero packet drops.',
    diffSummary: '+ 4 microservices, + gRPC, + 12,000 QPS',
    quantificationScore: 92,
    metricAdded: '12,000 QPS throughput with gRPC',
  },
];

export const MOCK_ROADMAP_MILESTONES: RoadmapMilestone[] = [
  {
    id: 'rm_1',
    week: 1,
    title: 'Distributed Consensus: Raft Invariants',
    description: 'Master leader election, log replication, and commit index safety invariants.',
    estimatedHours: 8,
    isCompleted: true,
    skillsGained: ['Raft Protocol', 'Leader Election', 'Split-brain Prevention'],
    resources: [
      { name: 'Raft Paper (Ongaro & Ousterhout)', type: 'doc' },
      { name: 'StudyPilot Raft Video Transcript', type: 'doc' },
    ],
  },
  {
    id: 'rm_2',
    week: 2,
    title: 'Kafka Consumer Groups & Partitioning',
    description: 'Implement consumer rebalance listeners, at-least-once vs exactly-once semantics.',
    estimatedHours: 10,
    isCompleted: false,
    skillsGained: ['Kafka Streams', 'Partition Offsets', 'Idempotent Producers'],
    resources: [
      { name: 'Kafka The Definitive Guide (Ch 4)', type: 'doc' },
    ],
  },
  {
    id: 'rm_3',
    week: 3,
    title: 'Redis Caching & Cache Stampede Solutions',
    description: 'Implement mutex locks, probabilistic early expiration, and Redis Cluster sharding.',
    estimatedHours: 6,
    isCompleted: false,
    skillsGained: ['Redis Sentinel', 'Cache-aside Pattern', 'Bloom Filters'],
    resources: [
      { name: 'Redis Architecture Deep Dive', type: 'course' },
    ],
  },
];

export const MOCK_INTERVIEW_QUESTIONS: MockInterviewQuestion[] = [
  {
    id: 'iq_1',
    prompt: 'How would you handle a distributed transaction spanning two independent databases while ensuring ACID isolation and preventing deadlocks?',
    type: 'technical',
    source: 'JD',
    sourceNoteTitle: 'Senior Backend Engineer JD',
    expectedKeywords: ['Two-Phase Commit', 'Saga Pattern', 'Idempotency', 'Compensating Transactions'],
  },
  {
    id: 'iq_2',
    prompt: 'Explain what happens during a Raft leader election when network partitions isolate the leader from the majority cohort.',
    type: 'technical',
    source: 'Notes',
    sourceNoteTitle: 'Distributed Systems & Raft Notes',
    expectedKeywords: ['Term increment', 'Heartbeat timeout', 'Split brain prevention', 'Majority quorum'],
  },
  {
    id: 'iq_3',
    prompt: 'Tell me about a time you diagnosed and resolved an unexpected production performance bottleneck.',
    type: 'behavioral',
    source: 'Mixed',
    expectedKeywords: ['Profiling', 'Root cause analysis', 'Quantified outcome', 'Post-mortem'],
  },
];

export const MOCK_RAG_METRICS: RAGEvalMetric[] = [
  {
    metricName: 'Faithfulness',
    baselineScore: 78.4,
    hybridScore: 89.2,
    rerankedScore: 96.8,
    target: 95.0,
    description: 'Proportion of generated claims grounded directly in retrieved source passages.',
  },
  {
    metricName: 'Answer Relevance',
    baselineScore: 72.1,
    hybridScore: 86.5,
    rerankedScore: 94.2,
    target: 90.0,
    description: 'Semantic congruence of response to user query intent without irrelevant fluff.',
  },
  {
    metricName: 'Context Precision',
    baselineScore: 68.9,
    hybridScore: 82.0,
    rerankedScore: 91.5,
    target: 88.0,
    description: 'Ratio of relevant chunks placed at top-k ranks vs noise chunks.',
  },
  {
    metricName: 'Context Recall',
    baselineScore: 74.0,
    hybridScore: 85.3,
    rerankedScore: 93.1,
    target: 90.0,
    description: 'Proportion of ground-truth evidence successfully retrieved from documents.',
  },
];

export const MOCK_RAG_TEST_CASES: RAGEvalTestCase[] = [
  {
    id: 'tc_1',
    query: 'Does Strict 2PL release exclusive locks during the shrinking phase?',
    retrievedContext: 'Under Strict 2PL, all Exclusive (X) locks are retained until commit or abort.',
    groundTruth: 'No, exclusive locks must be held until transaction termination.',
    faithfulness: 99.2,
    relevance: 98.4,
    latencyMs: 380,
    passed: true,
  },
  {
    id: 'tc_2',
    query: 'What page replacement algorithm suffers from Belady’s anomaly?',
    retrievedContext: 'FIFO page replacement paradoxically experiences increased faults as frames increase.',
    groundTruth: 'FIFO page replacement.',
    faithfulness: 100.0,
    relevance: 99.1,
    latencyMs: 310,
    passed: true,
  },
  {
    id: 'tc_3',
    query: 'What is the randomized timeout range in Raft leader elections?',
    retrievedContext: 'Raft uses randomized election timeouts between 150ms and 300ms.',
    groundTruth: '150ms to 300ms.',
    faithfulness: 98.6,
    relevance: 97.5,
    latencyMs: 410,
    passed: true,
  },
];

export const MOCK_MEMORY_FACTS: MemoryFact[] = [
  {
    id: 'mem_1',
    workspaceId: 'ws_core',
    fact: 'Preparing for Distributed Systems Finals on Nov 20, 2026',
    isPinned: true,
    createdAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 'mem_2',
    workspaceId: 'ws_core',
    fact: 'Targeting Senior Backend Engineer role at Stripe/Datadog',
    isPinned: true,
    createdAt: '2026-09-22T14:30:00Z',
  },
  {
    id: 'mem_3',
    workspaceId: 'ws_core',
    fact: 'Prefers code snippets in Go and Python with tabular comparison matrices',
    isPinned: false,
    createdAt: '2026-10-01T09:15:00Z',
  },
];
