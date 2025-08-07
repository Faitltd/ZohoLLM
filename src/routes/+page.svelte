<script>
	import { onMount } from 'svelte';

	let message = '';
	let entity = '';
	let chatHistory = [];
	let loading = false;

	async function sendMessage() {
		if (!message.trim() || !entity.trim()) {
			alert('Please enter both a message and entity ID');
			return;
		}

		loading = true;
		
		// Add user message to chat history
		chatHistory = [...chatHistory, { role: 'user', content: message }];
		
		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ message, entity })
			});

			const data = await response.json();
			
			if (data.response) {
				// Add AI response to chat history
				chatHistory = [...chatHistory, { role: 'assistant', content: data.response }];
			} else {
				chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
			}
		} catch (error) {
			console.error('Error sending message:', error);
			chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
		}

		message = '';
		loading = false;
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<main>
	<div class="container">
		<h1>Zoho CRM AI Assistant</h1>
		
		<div class="entity-input">
			<label for="entity">Entity ID:</label>
			<input 
				id="entity"
				type="text" 
				bind:value={entity} 
				placeholder="Enter Lead ID, Deal ID, etc."
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
				<button on:click={sendMessage} disabled={loading || !message.trim() || !entity.trim()}>
					Send
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

	.entity-input {
		margin-bottom: 20px;
	}

	.entity-input label {
		display: block;
		margin-bottom: 5px;
		font-weight: bold;
	}

	.entity-input input {
		width: 100%;
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 16px;
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
