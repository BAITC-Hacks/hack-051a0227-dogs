#!/usr/bin/env python3
"""Reproducible RU essay TF-IDF/logistic baseline; no applicant data is training data.

Usage: python3 scripts/essay-detector.py train .local/essay-dataset data/essay-detector/model.json
       python3 scripts/essay-detector.py infer data/essay-detector/model.json < text.txt
"""
import collections
import hashlib
import json
import math
import pathlib
import random
import re
import sys

SEED = 270926
TOKEN = re.compile(r"[a-zа-яё]{2,}", re.I)
SOURCE = "https://github.com/CoffeBank/Ru-hard-detection-dataset/tree/main/main/essay"


def words(text):
    return TOKEN.findall(text.lower())


def features(text, ngrams=2):
    tokens = words(text)
    result = list(tokens)
    if ngrams == 2:
        result += [f"{a}~{b}" for a, b in zip(tokens, tokens[1:])]
    return collections.Counter(result)


def dataset(directory):
    files = [directory / "original_essay.json", directory / "generated_essays.json"]
    records = []
    hashes = {}
    for label, path in enumerate(files):
        raw = path.read_bytes()
        hashes[path.name] = hashlib.sha256(raw).hexdigest()
        for item in json.loads(raw):
            if item.get("source") != ("human" if label == 0 else "ai") or item.get("dataset") != "Corus Essays":
                raise ValueError("Unexpected source provenance")
            text = item["text"].strip()
            if len(words(text)) < 40:
                continue
            records.append({"group": str(item["id"]), "text": text, "label": label,
                            "origin": "human" if label == 0 else "fully_machine",
                            "model": item.get("model")})
    # Exact copies across identifiers must share one split; no duplicate text is an independent example.
    owner = {}
    parent = {r["group"]: r["group"] for r in records}

    def root(x):
        while parent[x] != x:
            x = parent[x]
        return x

    for r in records:
        digest = hashlib.sha256(r["text"].encode()).hexdigest()
        if digest in owner:
            parent[root(r["group"])] = root(owner[digest])
        else:
            owner[digest] = r["group"]
    for r in records:
        r["group"] = root(r["group"])
    # Identical text cannot appear as two contradictory independent labels.
    unique = {}
    for r in records:
        key = hashlib.sha256(r["text"].encode()).hexdigest()
        if key in unique:
            if unique[key]["label"] != r["label"]:
                raise ValueError("Contradictory exact duplicate")
            continue
        unique[key] = r
    return list(unique.values()), hashes


def partition(records):
    groups = sorted({r["group"] for r in records})
    random.Random(SEED).shuffle(groups)
    n = len(groups)
    train, valid = set(groups[:int(n * .70)]), set(groups[int(n * .70):int(n * .85)])
    return [[r for r in records if r["group"] in selected] for selected in
            [train, valid, set(groups) - train - valid]]


def fit_vectorizer(records, ngrams):
    df = collections.Counter()
    for r in records:
        df.update(features(r["text"], ngrams))
    vocabulary = [term for term, count in df.most_common() if count >= 3][:12000]
    return {term: math.log((len(records) + 1) / (df[term] + 1)) + 1 for term in vocabulary}


def vector(text, idf, ngrams):
    counts = features(text, ngrams)
    values = {key: (1 + math.log(count)) * idf[key] for key, count in counts.items() if key in idf}
    norm = math.sqrt(sum(value * value for value in values.values())) or 1
    return {key: value / norm for key, value in values.items()}


def sigmoid(x):
    return 1 / (1 + math.exp(-max(-30, min(30, x))))


def train(records, ngrams):
    idf = fit_vectorizer(records, ngrams)
    vectors = [(vector(r["text"], idf, ngrams), r["label"]) for r in records]
    weights, bias = collections.defaultdict(float), 0.0
    rng = random.Random(SEED)
    for epoch in range(35):
        rng.shuffle(vectors)
        rate = .8 / (1 + epoch * .11)
        for values, label in vectors:
            probability = sigmoid(bias + sum(weights[k] * v for k, v in values.items()))
            error = probability - label
            bias -= rate * error
            for k, v in values.items():
                weights[k] -= rate * (error * v + .0002 * weights[k])
    return {"idf": idf, "weights": dict(weights), "bias": bias, "ngrams": ngrams}


def predict(model, text):
    values = vector(text, model["idf"], model["ngrams"])
    return sigmoid(model["bias"] + sum(model["weights"].get(k, 0) * v for k, v in values.items()))


def metrics(records, model, threshold=.5):
    pairs = [(r["label"], predict(model, r["text"])) for r in records]
    tp = fp = tn = fn = 0
    for label, probability in pairs:
        predicted = int(probability >= threshold)
        if label and predicted: tp += 1
        elif label: fn += 1
        elif predicted: fp += 1
        else: tn += 1
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else None
    ranked = sorted(pairs, key=lambda x: -x[1])
    positive = sum(y for y, _ in ranked)
    seen = 0
    ap = 0
    for index, (label, _) in enumerate(ranked, 1):
        if label:
            seen += 1
            ap += seen / index
    bins = []
    for low in [i / 10 for i in range(10)]:
        subset = [(y, p) for y, p in pairs if low <= p < low + .1]
        bins.append({"range": [low, round(low + .1, 1)], "n": len(subset),
                     "meanPrediction": sum(p for _, p in subset) / len(subset) if subset else None,
                     "positiveRate": sum(y for y, _ in subset) / len(subset) if subset else None})
    return {"n": len(pairs), "human": tn + fp, "machine": tp + fn,
            "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
            "precision": precision, "recall": recall, "f1_binary": f1,
            "falsePositiveRate": fp / (fp + tn) if fp + tn else None,
            "averagePrecision": ap / positive if positive else None,
            "brier": sum((p - y) ** 2 for y, p in pairs) / len(pairs) if pairs else None,
            "calibrationBins": bins}


def main():
    command = sys.argv[1]
    if command == "infer":
        artifact = pathlib.Path(sys.argv[2]).resolve()
        trusted = (pathlib.Path(__file__).resolve().parent.parent / "data/essay-detector").resolve()
        if trusted not in artifact.parents:
            raise ValueError("Artifact outside trusted directory")
        model = json.loads(artifact.read_text())["model"]
        text = sys.stdin.read(30000)
        if len(words(text)) < 100:
            print(json.dumps({"status": "TOO_SHORT"}))
        else:
            print(json.dumps({"status": "TECHNICAL_SIGNAL", "score": predict(model, text),
                              "modelVersion": "ru-essay-tfidf-v1"}))
        return
    if command != "train" or len(sys.argv) != 4:
        raise ValueError("Usage: train DATA_DIR ARTIFACT | infer ARTIFACT")
    records, hashes = dataset(pathlib.Path(sys.argv[2]))
    training, validation, test = partition(records)
    # Model selection uses validation only. The held-out test remains untouched until this point.
    candidates = []
    for ngrams in [1, 2]:
        model = train(training, ngrams)
        candidates.append((metrics(validation, model)["f1_binary"] or 0, ngrams))
    chosen = max(candidates)[1]
    groups = sorted({r["group"] for r in training})
    random.Random(SEED + 1).shuffle(groups)
    cross_validation = []
    for fold in range(3):
        held = set(groups[fold::3])
        fit = [r for r in training if r["group"] not in held]
        evaluate = [r for r in training if r["group"] in held]
        cross_validation.append(metrics(evaluate, train(fit, chosen)))
    model = train(training + validation, chosen)
    baseline = train(training + validation, 1)
    artifact = {"version": "ru-essay-tfidf-v1", "source": SOURCE, "license": "MIT",
                "fileSha256": hashes, "seed": SEED, "split": "70/15/15 grouped by original id and exact duplicates",
                "sampleCounts": {"train": len(training), "validation": len(validation), "test": len(test)},
                "positiveClass": "fully_machine", "scope": "Russian Corus Essays; not admissions essays",
                "threshold": .5, "selectedNgrams": chosen, "validationCandidates": candidates,
                "crossValidation": cross_validation,
                "baseline": "unigram TF-IDF with the same logistic learner",
                "baselineTestMetrics": metrics(test, baseline),
                "testMetrics": metrics(test, model), "model": model}
    destination = pathlib.Path(sys.argv[3])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({key: value for key, value in artifact.items() if key != "model"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
