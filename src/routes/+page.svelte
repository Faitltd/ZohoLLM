<script lang="ts">
	import { onMount } from 'svelte';

	type ChatMessage = { role: 'user' | 'assistant'; content: string };
	let message: string = '';
	let searchName: string = '';
	let chatHistory: ChatMessage[] = [];
	let loading: boolean = false;

	// Load chat history and searchName from localStorage for simple persistence
	onMount(() => {
		try {
			const saved = localStorage.getItem('chatHistory');
			const savedSearch = localStorage.getItem('searchName');
			if (saved) chatHistory = JSON.parse(saved);
			if (savedSearch) searchName = savedSearch;
		} catch { /* ignore */ }
	});

	function saveState() {
		try {
			localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
			localStorage.setItem('searchName', searchName);
		} catch { /* ignore */ }
	}

	async function sendMessage() {
		if (!message.trim() || !searchName.trim()) {
			alert('Please enter both a message and search name');
			return;
		}

		loading = true;

		// Add user message to chat history
		chatHistory = [...chatHistory, { role: 'user', content: message }];
		saveState();

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ message, entity: searchName })
			});

			const data = await response.json();

			if (data.response) {
				// Add AI response to chat history
				chatHistory = [...chatHistory, { role: 'assistant', content: data.response }];
			} else {
				chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
			}
			saveState();
		} catch (error) {
			console.error('Error sending message:', error);
			chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
			saveState();
		}

		message = '';
		loading = false;
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<main>
	<div class="container">
		<h1>Zoho CRM AI Assistant</h1>
		
		<div class="search-input">
			<label for="searchName">Lead Name, Deal Name, or Company:</label>
			<input
				id="searchName"
				type="text"
				bind:value={searchName}
				placeholder="Enter Lead Name, Deal Name, or Company (e.g., John Doe, Q4 Sales Deal, Acme Corp)"
			/>
		</div>

		<div class="chat-container">
			<div class="chat-history">
				{#each chatHistory as chat}
					<div class="message {chat.role}">
						<strong>{chat.role === 'user' ? 'You' : 'AI'}:</strong>
						<p>{chat.content}</p>
					</div>
				{/each}
				{#if loading}
					<div class="message assistant">
						<strong>AI:</strong>
						<p>Thinking...</p>
					</div>
				{/if}
			</div>

			<div class="input-container">
				<textarea
					bind:value={message}
					on:keypress={handleKeyPress}
					placeholder="Ask a question about your CRM data..."
					disabled={loading}
				></textarea>
				<button on:click={sendMessage} disabled={loading || !message.trim() || !searchName.trim()}>
					{loading ? '⏳' : '📤'} Send
				</button>
			</div>
		</div>
	</div>
</main>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 20px;
		font-family: Arial, sans-serif;
	}

	h1 {
		text-align: center;
		color: #333;
		margin-bottom: 30px;
	}

	.search-input {
		margin-bottom: 20px;
	}

	.search-input label {
		display: block;
		margin-bottom: 8px;
		font-weight: 600;
		color: #333;
	}

	.search-input input {
		width: 100%;
		padding: 12px;
		border: 2px solid #e1e5e9;
		border-radius: 8px;
		font-size: 16px;
		transition: border-color 0.2s;
	}

	.search-input input:focus {
		outline: none;
		border-color: #007cba;
	}

	.chat-container {
		border: 1px solid #ddd;
		border-radius: 8px;
		height: 500px;
		display: flex;
		flex-direction: column;
	}

	.chat-history {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		background-color: #f9f9f9;
	}

	.message {
		margin-bottom: 15px;
		padding: 10px;
		border-radius: 8px;
	}

	.message.user {
		background-color: #e3f2fd;
		margin-left: 20px;
	}

	.message.assistant {
		background-color: #f1f8e9;
		margin-right: 20px;
	}

	.message strong {
		color: #333;
	}

	.message p {
		margin: 5px 0 0 0;
		line-height: 1.4;
	}

	.input-container {
		display: flex;
		padding: 20px;
		border-top: 1px solid #ddd;
		background-color: white;
	}

	textarea {
		flex: 1;
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 4px;
		resize: vertical;
		min-height: 60px;
		font-family: inherit;
		font-size: 14px;
	}

	button {
		margin-left: 10px;
		padding: 10px 20px;
		background-color: #007cba;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
	}

	button:hover:not(:disabled) {
		background-color: #005a87;
	}

	button:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}
</style>
