import os
import sys
import hashlib
from craiyon import Craiyon

q = ' '.join(sys.argv[1:])
e = q.encode('utf-8')
h = hashlib.sha256(e).hexdigest()

dir = os.path.join('public', h)
if not os.path.exists(dir):
	os.mkdir(dir)
	f = open(os.path.join(dir, 'query'), 'w')
	f.write(q)
	generator = Craiyon() # Instantiates the api wrapper
	result = generator.generate(q)
	result.save_images(dir) # Saves the generated images to 'current working directory/generated', you can also provide a custom path