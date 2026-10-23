"""Built-in demo corpus for the Exam Predictor: one syllabus + three papers.

Lets the feature be demoed with no uploads. The text is plain and structured the
way real papers are, so the same extraction prompts work on it.
"""

DEMO_SYLLABUS = """Operating Systems — End Semester Syllabus

Unit 1: Process Management
- Process states and transitions
- CPU scheduling algorithms (FCFS, SJF, Round Robin)
- Context switching

Unit 2: Synchronisation and Deadlocks
- Critical section problem
- Semaphores and monitors
- Deadlock detection and Banker's algorithm

Unit 3: Memory Management
- Paging and segmentation
- Page replacement algorithms (FIFO, LRU, Optimal)
- Virtual memory and thrashing

Unit 4: File Systems and I/O
- File allocation methods
- Disk scheduling algorithms
- RAID levels
"""

DEMO_PAPERS: dict[int, str] = {
    2022: """Operating Systems — Previous Year Paper (2022)

Unit 1
1. Explain the process state diagram with all transitions. [5]
2. Compare FCFS and Round Robin CPU scheduling with an example. [8]

Unit 2
3. State the critical section problem and show how semaphores solve it. [10]
4. Explain deadlock detection using a wait-for graph. [5]

Unit 3
5. Differentiate paging and segmentation. [5]
6. Apply the Banker's algorithm to the given allocation table and decide if the state is safe. [10]

Unit 4
7. Explain the file allocation methods with their trade-offs. [8]
""",
    2023: """Operating Systems — Previous Year Paper (2023)

Unit 1
1. Discuss process states and the events that cause each transition. [5]
2. Compute average waiting time for the given processes under SJF and Round Robin. [10]

Unit 2
3. Explain semaphores and monitors with a producer-consumer example. [8]
4. Describe deadlock detection and recovery. [5]

Unit 3
5. Explain virtual memory and thrashing. [5]
6. Compare FIFO, LRU and Optimal page replacement on the reference string. [10]

Unit 4
7. Explain disk scheduling algorithms with an example. [8]
""",
    2024: """Operating Systems — Previous Year Paper (2024)

Unit 1
1. Explain context switching and its cost. [5]
2. Compare FCFS, SJF and Round Robin scheduling. [8]

Unit 2
3. What is the critical section problem? Show a semaphore solution. [10]
4. Apply the Banker's algorithm and determine a safe sequence. [8]

Unit 3
5. Differentiate paging and segmentation with diagrams. [5]
6. Explain LRU page replacement and compute the page faults for the given string. [8]

Unit 4
7. Compare RAID levels 0, 1 and 5. [5]
8. Explain file allocation methods. [5]
""",
}


def demo_sources() -> list[dict]:
    """Sources in the shape ``exam.run_analysis`` expects (text instead of document ids)."""
    sources: list[dict] = [{"kind": "syllabus", "year": None, "name": "Demo syllabus", "text": DEMO_SYLLABUS}]
    sources += [
        {"kind": "paper", "year": year, "name": f"Demo paper {year}", "text": text}
        for year, text in sorted(DEMO_PAPERS.items())
    ]
    return sources
