from scripts.classify_topics import classify_text


def test_classify_ai_and_design_terms():
    topics, matches = classify_text("AI agents, Figma design system and frontend product")

    assert "IA" in topics
    assert "Diseño" in topics
    assert matches["IA"]
    assert matches["Diseño"]


def test_classify_unknown_text_returns_empty_topics():
    topics, matches = classify_text("Una nota personal sin términos de la taxonomía")

    assert topics == []
    assert matches == {}
