FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user (Hugging Face requirement for security)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy requirements and install
COPY --chown=user ./requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r $HOME/app/requirements.txt

# Copy all application files
COPY --chown=user . $HOME/app

# Hugging Face expects the app to run on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
